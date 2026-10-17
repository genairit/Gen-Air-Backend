import {
  Injectable,
  HttpException,
  ConflictException,
  BadGatewayException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';

import {
  MAX_FOLDER_DEPTH,
  PROJECT_ROOT_FOLDER_NAME,
} from './constants/project-drive.constant';

import {
  IDriveItem,
  TFileCountByFolderId,
} from '@Interfaces/google-drive.interface';

import { rm } from 'node:fs/promises';
import { OnEvent } from '@nestjs/event-emitter';
import { DriveFolderDto } from './dto/drive-folder.dto';
import { Meta, TypedLogger } from '@Logger/logger.service';
import { ProjectService } from '@Modules/project/project.service';
import { DOMAIN_EVENTS } from '@Constants/domain-events.constant';
import { decodeUploadedFileName } from '@Utilities/upload.utility';
import { IProject } from '@Modules/project/interfaces/project.interface';
import { IProjectDriveContents } from './interfaces/project-drive.interface';
import { renderDriveFolderName } from './utilities/drive-folder-name.utility';
import { toProjectDriveFolder } from './utilities/drive-folder-status.utility';
import type { IProjectCreatedEvent } from '@Interfaces/domain-event.interface';
import { validateDriveUploads } from '@Utilities/validate-drive-upload.utility';
import { GoogleDriveService } from '@Providers/google-drive/google-drive.service';
import { IDriveConnectionResult } from '@Providers/google-drive/interfaces/drive-connection.interface';
import { DriveTemplateFolderService } from '@Modules/drive-template-folder/drive-template-folder.service';
import { IDriveTemplateFolderNode } from '@Modules/drive-template-folder/interfaces/drive-template-folder.interface';

@Injectable()
export class ProjectDriveService {
  private readonly logger = new TypedLogger<Meta>(ProjectDriveService.name);

  constructor(
    private readonly projectService: ProjectService,
    private readonly googleDriveService: GoogleDriveService,
    private readonly driveTemplateFolderService: DriveTemplateFolderService,
  ) {}

  checkConnection(): Promise<IDriveConnectionResult> {
    return this.googleDriveService.checkConnection();
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

  async provision(projectId: string): Promise<IProject> {
    const projectsRootFolderId = this.getProjectsRootFolderId();
    const [project, templateTree] = await Promise.all([
      this.projectService.getById(projectId),
      this.driveTemplateFolderService.getTree(),
    ]);

    const projectFolderId = await this.ensureProjectFolder(
      project,
      projectsRootFolderId,
    );

    await this.callDrive(() =>
      this.createTemplateFolders(project, templateTree, projectFolderId),
    );

    return this.projectService.getById(projectId);
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

  private async ensureProjectFolder(
    project: IProject,
    projectsRootFolderId: string,
  ): Promise<string> {
    if (project.driveFolderId) {
      return project.driveFolderId;
    }

    const projectFolderId = await this.callDrive(() =>
      this.googleDriveService.ensureFolder(
        renderDriveFolderName(PROJECT_ROOT_FOLDER_NAME, project),
        projectsRootFolderId,
      ),
    );

    await this.projectService.setDriveFolderId(project.id, projectFolderId);

    return projectFolderId;
  }

  private async createTemplateFolders(
    project: IProject,
    templateNodes: IDriveTemplateFolderNode[],
    parentFolderId: string,
  ): Promise<void> {
    await Promise.all(
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
  }

  private async resolveProjectFolder(
    projectId: string,
    folder: DriveFolderDto,
  ): Promise<string> {
    this.assertDriveConfigured();

    const project = await this.projectService.getById(projectId);
    const projectFolderId = project.driveFolderId;

    if (!projectFolderId) {
      throw new ConflictException(
        `Project ${projectId} has no Drive folder yet; create it first`,
      );
    }

    const folderId = folder.folderId ?? projectFolderId;
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

      this.logger.error({ error, message: 'Google Drive request failed' });

      throw new BadGatewayException('Google Drive request failed', {
        cause: error,
      });
    }
  }
}
