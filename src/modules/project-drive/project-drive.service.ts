import {
  Injectable,
  HttpException,
  NotFoundException,
  ConflictException,
  BadGatewayException,
  BadRequestException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';

import {
  MAX_FOLDER_DEPTH,
  APARTMENTS_FOLDER_NAME,
  PROJECT_ROOT_FOLDER_NAME,
  PROJECT_DRIVE_ERROR_CODES,
} from './constants/project-drive.constant';

import {
  IDriveItem,
  IDriveFileMetadata,
  TFileCountByFolderId,
} from '@Interfaces/google-drive.interface';

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OnEvent } from '@nestjs/event-emitter';
import { DriveFolderDto } from './dto/drive-folder.dto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { Meta, TypedLogger } from '@Logger/logger.service';
import { GOOGLE_DRIVE } from '@Constants/google-drive.constant';
import { ProjectService } from '@Modules/project/project.service';
import { DOMAIN_EVENTS } from '@Constants/domain-events.constant';
import { decodeUploadedFileName } from '@Utilities/upload.utility';
import { IProject } from '@Modules/project/interfaces/project.interface';
import { ISharedDocument } from './interfaces/shared-document.interface';
import { ApartmentFolderRepairDto } from './dto/apartment-folder-repair.dto';
import { IProjectDriveContents } from './interfaces/project-drive.interface';
import { SHARED_DOCUMENT_STATUS } from './constants/shared-document.constant';
import { renderDriveFolderName } from './utilities/drive-folder-name.utility';
import { toProjectDriveFolder } from './utilities/drive-folder-status.utility';
import type { IProjectCreatedEvent } from '@Interfaces/domain-event.interface';
import { validateDriveUploads } from '@Utilities/validate-drive-upload.utility';
import { GoogleDriveService } from '@Providers/google-drive/google-drive.service';
import { IApartmentFolderRepair } from './interfaces/apartment-folder-repair.interface';
import { DRIVE_CONNECTION_STATUS } from '@Providers/google-drive/constants/drive-connection.constant';
import { getDriveConnectionFailure } from '@Providers/google-drive/utilities/drive-connection.utility';
import { IDriveConnectionResult } from '@Providers/google-drive/interfaces/drive-connection.interface';
import { DriveTemplateFolderService } from '@Modules/drive-template-folder/drive-template-folder.service';
import { IDriveTemplateFolderNode } from '@Modules/drive-template-folder/interfaces/drive-template-folder.interface';

type TPendingApartmentFolderRepair = {
  sourceFolderId: string;
  destinationFolderId: string;
  operation: Promise<IProject>;
};

@Injectable()
export class ProjectDriveService {
  private readonly logger = new TypedLogger<Meta>(ProjectDriveService.name);

  private readonly provisioning = new Map<string, Promise<IProject>>();
  private readonly repairs = new Map<string, TPendingApartmentFolderRepair>();

  constructor(
    private readonly projectService: ProjectService,
    private readonly googleDriveService: GoogleDriveService,
    private readonly driveTemplateFolderService: DriveTemplateFolderService,
  ) {}

  checkConnection(): Promise<IDriveConnectionResult> {
    return this.googleDriveService.checkConnection();
  }

  async uploadQuotationPdf(
    projectId: string,
    name: string,
    pdf: Buffer,
  ): Promise<IDriveItem> {
    const projectFolderId = await this.resolveProjectFolder(projectId, {});
    const quotationsFolderId = await this.callDrive(() =>
      this.googleDriveService.ensureFolder('הצעות מחיר', projectFolderId),
    );
    const temporaryDirectory = await mkdtemp(
      join(tmpdir(), 'genair-quotation-'),
    );
    const localPath = join(temporaryDirectory, 'quotation.pdf');
    try {
      await writeFile(localPath, pdf);
      return await this.callDrive(() =>
        this.googleDriveService.uploadFile({
          name,
          localPath,
          parentId: quotationsFolderId,
          mimeType: 'application/pdf',
        }),
      );
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }

  @OnEvent(DOMAIN_EVENTS.PROJECT_CREATED)
  async handleProjectCreated(event: IProjectCreatedEvent): Promise<void> {
    if (!this.googleDriveService.isConfigured()) {
      this.logger.warn({
        projectId: event.projectId,
        message: 'Google Drive is not configured; skipping project folders',
      });

      return;
    }

    try {
      await this.provision(event.projectId);
    } catch (error) {
      this.logger.error({
        error,
        projectId: event.projectId,
        message: 'Failed to create the project Drive folders',
      });
    }
  }

  provision(projectId: string): Promise<IProject> {
    const pending = this.provisioning.get(projectId);
    if (pending) {
      return pending;
    }

    const operation = this.provisionProject(projectId).finally(() => {
      this.provisioning.delete(projectId);
    });
    this.provisioning.set(projectId, operation);
    return operation;
  }

  async getApartmentFolderRepair(
    projectId: string,
  ): Promise<IApartmentFolderRepair> {
    this.assertDriveConfigured();
    const apartment = await this.projectService.getById(projectId);
    if (!apartment.parentProjectId) {
      throw new BadRequestException('Select an apartment project');
    }

    if (!apartment.driveFolderId) {
      throw new ConflictException('Provision this apartment first');
    }

    const building = await this.projectService.getById(
      apartment.parentProjectId,
    );
    const buildingFolderId = building.driveFolderId;
    if (!buildingFolderId) {
      throw new ConflictException('Provision the building first');
    }

    const destination =
      await this.getApartmentsFolderForRepair(buildingFolderId);
    const source = await this.requireLiveItem(apartment.driveFolderId);
    if (source.mimeType !== GOOGLE_DRIVE.FOLDER_MIME_TYPE) {
      throw new ConflictException('The apartment Drive link is not a folder');
    }

    const isAlreadyPlaced = this.isRepairableApartmentFolder(
      source,
      destination.id,
    );
    if (!isAlreadyPlaced) {
      await this.assertNoApartmentFolderCollision(
        source.name ?? apartment.name,
        destination.id,
      );
    }

    return {
      apartmentId: apartment.id,
      buildingId: building.id,
      sourceFolderId: source.id,
      destinationFolderId: destination.id,
      status: isAlreadyPlaced ? 'already_placed' : 'needs_move',
    };
  }

  private async getApartmentsFolderForRepair(
    buildingFolderId: string,
  ): Promise<IDriveItem> {
    const children = await this.callDrive(() =>
      this.googleDriveService.listChildren(buildingFolderId),
    );
    const destinations = children.filter(
      (child) => child.isFolder && child.name === APARTMENTS_FOLDER_NAME,
    );
    if (destinations.length !== 1) {
      throw new ConflictException(
        'Provision the building or resolve duplicate apartment folders first',
      );
    }

    return destinations[0];
  }

  private isRepairableApartmentFolder(
    source: IDriveFileMetadata,
    destinationFolderId: string,
  ): boolean {
    const isAlreadyPlaced =
      source.parents.length === 1 && source.parents[0] === destinationFolderId;
    const isLegacyRoot =
      source.parents.length === 1 &&
      source.parents[0] === this.getProjectsRootFolderId();
    if (!isAlreadyPlaced && !isLegacyRoot) {
      throw new ConflictException(
        'The apartment folder is outside the expected legacy root',
      );
    }

    return isAlreadyPlaced;
  }

  private async assertNoApartmentFolderCollision(
    sourceName: string,
    destinationFolderId: string,
  ): Promise<void> {
    const children = await this.callDrive(() =>
      this.googleDriveService.listChildren(destinationFolderId),
    );
    const hasNameCollision = children.some(
      (child) => child.isFolder && child.name === sourceName,
    );
    if (hasNameCollision) {
      throw new ConflictException(
        'An apartment folder with this name already exists',
      );
    }
  }

  async repairApartmentFolder(
    projectId: string,
    repair: ApartmentFolderRepairDto,
  ): Promise<IProject> {
    const pending = this.repairs.get(projectId);
    if (pending) {
      const matchesSource = pending.sourceFolderId === repair.sourceFolderId;
      const matchesDestination =
        pending.destinationFolderId === repair.destinationFolderId;
      if (!matchesSource || !matchesDestination) {
        throw new ConflictException(
          'A different apartment folder repair is already in progress',
        );
      }

      return pending.operation;
    }

    const reviewedRepair = {
      sourceFolderId: repair.sourceFolderId,
      destinationFolderId: repair.destinationFolderId,
    };
    const operation = this.performApartmentFolderRepair(
      projectId,
      reviewedRepair,
    ).finally(() => this.repairs.delete(projectId));
    this.repairs.set(projectId, { ...reviewedRepair, operation });
    return operation;
  }

  private async performApartmentFolderRepair(
    projectId: string,
    repair: ApartmentFolderRepairDto,
  ): Promise<IProject> {
    const preview = await this.getApartmentFolderRepair(projectId);
    const matchesSource = preview.sourceFolderId === repair.sourceFolderId;
    const matchesDestination =
      preview.destinationFolderId === repair.destinationFolderId;
    if (!matchesSource || !matchesDestination) {
      throw new ConflictException(
        'The apartment folder repair plan has changed',
      );
    }

    if (preview.status === 'needs_move') {
      await this.callDrive(() =>
        this.googleDriveService.moveFile({
          fileId: preview.sourceFolderId,
          parentIds: [this.getProjectsRootFolderId()],
          destinationFolderId: preview.destinationFolderId,
        }),
      );
    }

    return this.provision(projectId);
  }

  async getContents(
    projectId: string,
    folder: DriveFolderDto,
  ): Promise<IProjectDriveContents> {
    const folderId = await this.resolveProjectFolder(projectId, folder);
    const items = await this.callDrive(() =>
      this.googleDriveService.listChildren(folderId),
    );

    const folders = items.filter((item) => item.isFolder);
    const fileCounts = await this.countFolderFiles(folders);

    return {
      folderId,
      files: items.filter((item) => !item.isFolder),
      folders: folders.map((folder) =>
        toProjectDriveFolder(folder, fileCounts),
      ),
    };
  }

  async upload(
    projectId: string,
    folder: DriveFolderDto,
    files: Express.Multer.File[],
  ): Promise<IDriveItem[]> {
    try {
      if (files.length === 0) {
        throw new BadRequestException('Attach at least one file');
      }

      const mimeTypes = await validateDriveUploads(files);
      const folderId = await this.resolveProjectFolder(projectId, folder);

      return await this.callDrive(() =>
        Promise.all(
          files.map((file, index) =>
            this.googleDriveService.uploadFile({
              parentId: folderId,
              localPath: file.path,
              mimeType: mimeTypes[index],
              name: decodeUploadedFileName(file.originalname),
            }),
          ),
        ),
      );
    } finally {
      await Promise.all(files.map((file) => rm(file.path, { force: true })));
    }
  }

  async moveFile(
    projectId: string,
    fileId: string,
    folder: DriveFolderDto,
  ): Promise<void> {
    const rootId = await this.resolveProjectFolder(projectId, {});
    const destinationFolderId = await this.resolveProjectFolder(
      projectId,
      folder,
    );
    const file = await this.requireProjectFile(fileId, rootId);
    if (file.parents.includes(destinationFolderId)) {
      return;
    }

    await this.callDrive(() =>
      this.googleDriveService.moveFile({
        fileId,
        parentIds: file.parents,
        destinationFolderId,
      }),
    );
  }

  async trashFile(projectId: string, fileId: string): Promise<void> {
    const rootId = await this.resolveProjectFolder(projectId, {});
    await this.requireProjectFile(fileId, rootId);
    await this.callDrive(() => this.googleDriveService.trashFile(fileId));
  }

  async readProjectAttachment(
    projectId: string,
    fileId: string,
    maxBytes: number,
  ): Promise<{ name: string; mimeType: string; content: Buffer }> {
    const rootId = await this.resolveProjectFolder(projectId, {});
    const file = await this.requireProjectFile(fileId, rootId);
    if (file.mimeType.startsWith('application/vnd.google-apps.')) {
      throw new BadRequestException(
        'Select a downloadable file, not a Google Workspace document',
      );
    }
    const content = await this.callDrive(() =>
      this.googleDriveService.downloadFile(fileId, maxBytes),
    );
    return {
      name: file.name ?? 'project-file',
      mimeType: file.mimeType,
      content,
    };
  }

  async selectSharedDocument(
    projectId: string,
    fileId: string | null,
  ): Promise<ISharedDocument> {
    if (fileId !== null && typeof fileId !== 'string') {
      throw new BadRequestException('Choose a file or clear the selection');
    }

    const project = await this.projectService.getById(projectId);
    if (project.parentProjectId || !project.projectType?.canHaveApartments) {
      throw new BadRequestException(
        'Only a parent project can share a document',
      );
    }

    if (fileId !== null) {
      const rootId = await this.resolveProjectFolder(projectId, {});
      await this.requireProjectFile(fileId, rootId);
    }

    await this.projectService.setSharedDocumentFileId(projectId, fileId);
    return this.getSharedDocument(projectId);
  }

  async getSharedDocument(projectId: string): Promise<ISharedDocument> {
    const project = await this.projectService.getById(projectId);
    const parent = project.parentProjectId
      ? await this.projectService.getById(project.parentProjectId)
      : project;
    const fileId = parent.sharedDocumentFileId;

    if (!fileId) {
      return { status: SHARED_DOCUMENT_STATUS.NONE, file: null };
    }

    if (!parent.driveFolderId) {
      return { status: SHARED_DOCUMENT_STATUS.UNAVAILABLE, file: null };
    }

    this.assertDriveConfigured();
    try {
      const file = await this.requireProjectFile(fileId, parent.driveFolderId);
      return {
        status: SHARED_DOCUMENT_STATUS.AVAILABLE,
        file: {
          id: file.id,
          name: file.name ?? 'מסמך משותף',
          url: `https://drive.google.com/open?id=${encodeURIComponent(file.id)}`,
        },
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        return { status: SHARED_DOCUMENT_STATUS.UNAVAILABLE, file: null };
      }
      throw error;
    }
  }

  private async requireProjectFile(
    fileId: string,
    rootId: string,
  ): Promise<IDriveFileMetadata> {
    const file = await this.requireLiveItem(fileId);
    const isFolder = file.mimeType === GOOGLE_DRIVE.FOLDER_MIME_TYPE;
    const isShortcut = file.mimeType === GOOGLE_DRIVE.SHORTCUT_MIME_TYPE;
    const hasNoParent = file.parents.length === 0;
    if (isFolder || isShortcut || hasNoParent) {
      throw new BadRequestException('Select a file inside this project');
    }

    const parentsWithinProject = await this.callDrive(() =>
      Promise.all(
        file.parents.map((parentId) => this.isWithinFolder(parentId, rootId)),
      ),
    );
    if (!parentsWithinProject.every(Boolean)) {
      throw new BadRequestException('The file is outside this project');
    }

    return file;
  }

  private async requireLiveItem(fileId: string): Promise<IDriveFileMetadata> {
    const item = await this.callDrive(() =>
      this.googleDriveService.getFileMetadata(fileId),
    );
    if (!item || item.trashed) {
      throw new NotFoundException('The Drive item is unavailable');
    }

    return item;
  }

  private async provisionProject(projectId: string): Promise<IProject> {
    const projectsRootFolderId = this.getProjectsRootFolderId();
    const [project, templateTree] = await Promise.all([
      this.projectService.getById(projectId),
      this.driveTemplateFolderService.getTree(),
    ]);
    const parentFolderId = project.parentProjectId
      ? await this.getApartmentsFolderId(project.parentProjectId)
      : projectsRootFolderId;
    const projectFolderId = await this.ensureProjectFolder(
      project,
      parentFolderId,
    );
    if (project.parentProjectId && project.driveFolderId) {
      await this.assertApartmentFolderLocation(projectFolderId, parentFolderId);
    }

    const templateNodes = project.parentProjectId
      ? templateTree.filter((node) => node.name !== APARTMENTS_FOLDER_NAME)
      : templateTree;
    await this.callDrive(() =>
      this.createTemplateFolders(project, templateNodes, projectFolderId),
    );
    if (!project.parentProjectId && project.projectType?.canHaveApartments) {
      await this.callDrive(() =>
        this.googleDriveService.ensureFolder(
          APARTMENTS_FOLDER_NAME,
          projectFolderId,
        ),
      );
    }

    if (!project.driveFolderId) {
      await this.projectService.setDriveFolderId(project.id, projectFolderId);
    }
    return this.projectService.getById(projectId);
  }

  private async ensureProjectFolder(
    project: IProject,
    parentFolderId: string,
  ): Promise<string> {
    if (project.driveFolderId) {
      return project.driveFolderId;
    }

    const projectFolderId = await this.callDrive(() =>
      this.googleDriveService.ensureFolder(
        renderDriveFolderName(PROJECT_ROOT_FOLDER_NAME, project),
        parentFolderId,
        project.id,
      ),
    );

    return projectFolderId;
  }

  private async getApartmentsFolderId(buildingId: string): Promise<string> {
    const building = await this.provision(buildingId);
    const buildingFolderId = building.driveFolderId;
    if (!buildingFolderId) {
      throw new ConflictException('The building Drive folder is unavailable');
    }

    return this.callDrive(() =>
      this.googleDriveService.ensureFolder(
        APARTMENTS_FOLDER_NAME,
        buildingFolderId,
      ),
    );
  }

  private async assertApartmentFolderLocation(
    folderId: string,
    apartmentsFolderId: string,
  ): Promise<void> {
    const folder = await this.requireLiveItem(folderId);
    if (folder.mimeType !== GOOGLE_DRIVE.FOLDER_MIME_TYPE) {
      throw new ConflictException('The apartment Drive link is not a folder');
    }

    const isInsideApartmentsFolder =
      folder.parents.length === 1 && folder.parents[0] === apartmentsFolderId;
    if (!isInsideApartmentsFolder) {
      throw new ConflictException({
        code: PROJECT_DRIVE_ERROR_CODES.APARTMENT_REPAIR_REQUIRED,
        message: 'Review and repair the apartment Drive folder location',
      });
    }
  }

  private async createTemplateFolders(
    project: IProject,
    templateNodes: IDriveTemplateFolderNode[],
    parentFolderId: string,
  ): Promise<void> {
    const results = await Promise.allSettled(
      templateNodes.map(async (templateNode) => {
        const folderId = await this.googleDriveService.ensureFolder(
          renderDriveFolderName(templateNode.name, project),
          parentFolderId,
        );

        await this.createTemplateFolders(
          project,
          templateNode.children,
          folderId,
        );
      }),
    );
    const failure = results.find((result) => result.status === 'rejected');
    if (failure) {
      throw failure.reason;
    }
  }

  private async resolveProjectFolder(
    projectId: string,
    folder: DriveFolderDto,
  ): Promise<string> {
    this.assertDriveConfigured();

    const project = await this.projectService.getById(projectId);
    const projectFolderId = project.driveFolderId;

    if (!projectFolderId) {
      throw new ConflictException({
        code: PROJECT_DRIVE_ERROR_CODES.NOT_PROVISIONED,
        message: 'The project Drive folder has not been created yet',
      });
    }

    const folderId = folder.folderId ?? projectFolderId;
    const metadata = await this.requireLiveItem(folderId);
    if (metadata.mimeType !== GOOGLE_DRIVE.FOLDER_MIME_TYPE) {
      throw new BadRequestException('Select a folder inside this project');
    }

    const isWithinProject = await this.callDrive(() =>
      this.isWithinFolder(folderId, projectFolderId),
    );

    if (!isWithinProject) {
      throw new BadRequestException(
        `Folder ${folderId} is not part of project ${projectId}`,
      );
    }

    return folderId;
  }

  private async isWithinFolder(
    folderId: string,
    ancestorId: string,
    depthLeft: number = MAX_FOLDER_DEPTH,
  ): Promise<boolean> {
    if (folderId === ancestorId) {
      return true;
    }

    if (depthLeft === 0) {
      return false;
    }

    const parentIds = await this.googleDriveService.findParentIds(folderId);

    if (!parentIds) {
      return false;
    }

    const parentResults = await Promise.all(
      parentIds.map((parentId) =>
        this.isWithinFolder(parentId, ancestorId, depthLeft - 1),
      ),
    );

    return parentResults.some(Boolean);
  }

  private async countFolderFiles(
    folders: IDriveItem[],
  ): Promise<TFileCountByFolderId | null> {
    try {
      return await this.googleDriveService.countDescendantFiles(
        folders.map((folder) => folder.id),
        MAX_FOLDER_DEPTH,
      );
    } catch (error) {
      this.logger.error({
        error,
        message: 'Failed to resolve Drive folder contents; reporting unknown',
      });

      return null;
    }
  }

  private assertDriveConfigured(): void {
    if (!this.googleDriveService.isConfigured()) {
      throw new ServiceUnavailableException('Google Drive is not configured');
    }
  }

  private getProjectsRootFolderId(): string {
    const projectsRootFolderId =
      this.googleDriveService.getProjectsRootFolderId();

    if (!projectsRootFolderId) {
      throw new ServiceUnavailableException('Google Drive is not configured');
    }

    return projectsRootFolderId;
  }

  private async callDrive<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      if (error instanceof RangeError) {
        throw new PayloadTooLargeException(
          'Drive file exceeds the email attachment limit',
        );
      }

      this.logger.error({ error, message: 'Google Drive request failed' });

      if (
        getDriveConnectionFailure(error) ===
        DRIVE_CONNECTION_STATUS.AUTHENTICATION_FAILED
      ) {
        throw new ServiceUnavailableException({
          code: PROJECT_DRIVE_ERROR_CODES.AUTHENTICATION_FAILED,
          message: 'Google Drive authentication is unavailable',
        });
      }

      throw new BadGatewayException('Google Drive request failed', {
        cause: error,
      });
    }
  }
}
