import {
  Injectable,
  HttpException,
  NotFoundException,
  ConflictException,
  BadGatewayException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';

import {
  DRIVE_FOLDER_LINK,
  DRIVE_FOLDER_LINK_ERROR_CODES,
} from './constants/drive-folder-link.constant';

import {
  IExistingDriveFolder,
  IDriveFolderTemplate,
} from './interfaces/drive-folder-link.interface';

import {
  MAX_FOLDER_DEPTH,
  APARTMENTS_FOLDER_NAME,
} from '@Modules/project-drive/constants/project-drive.constant';

import { Transaction } from 'sequelize';
import { chunkItems } from '@Utilities/array.utility';
import { Meta, TypedLogger } from '@Logger/logger.service';
import { GOOGLE_DRIVE } from '@Constants/google-drive.constant';
import { PreviewDriveFolderDto } from './dto/preview-drive-folder.dto';
import { IDriveFileMetadata } from '@Interfaces/google-drive.interface';
import { ProjectRepository } from '@Modules/project/project.repository';
import { IProject } from '@Modules/project/interfaces/project.interface';
import { GoogleDriveService } from '@Providers/google-drive/google-drive.service';
import { parseDriveFolderReference } from './utilities/drive-folder-reference.utility';
import { renderDriveFolderName } from '@Modules/project-drive/utilities/drive-folder-name.utility';
import { DRIVE_CONNECTION_STATUS } from '@Providers/google-drive/constants/drive-connection.constant';
import { getDriveConnectionFailure } from '@Providers/google-drive/utilities/drive-connection.utility';
import { DriveTemplateFolderService } from '@Modules/drive-template-folder/drive-template-folder.service';

@Injectable()
export class ProjectDriveLinkService {
  private readonly logger = new TypedLogger<Meta>(ProjectDriveLinkService.name);

  constructor(
    private readonly drive: GoogleDriveService,
    private readonly projects: ProjectRepository,
    private readonly templates: DriveTemplateFolderService,
  ) {}

  async preview(input: PreviewDriveFolderDto): Promise<IExistingDriveFolder> {
    const folder = await this.resolve(
      input.reference,
      input.buildingId ?? null,
    );
    const missingTemplateFolders = await this.missingFolders(
      folder.id,
      null,
      input.buildingId != null,
    );
    return {
      id: folder.id,
      name: folder.name ?? folder.id,
      missingTemplateFolders,
    };
  }

  async resolve(
    reference: string,
    buildingId: string | null = null,
    excludedProjectId: string | null = null,
  ): Promise<IDriveFileMetadata> {
    const rootId = this.drive.getProjectsRootFolderId();
    if (!rootId) {
      throw new ServiceUnavailableException({
        code: DRIVE_FOLDER_LINK_ERROR_CODES.NOT_CONFIGURED,
        message: 'חיבור Google Drive אינו מוגדר. יש לפנות למנהל המערכת',
      });
    }

    const folderId = parseDriveFolderReference(reference);
    const folder = await this.callDrive(() =>
      this.drive.getFileMetadata(folderId),
    );
    if (!folder || folder.trashed) {
      throw new NotFoundException({
        code: DRIVE_FOLDER_LINK_ERROR_CODES.NOT_FOUND,
        message: 'התיקייה לא נמצאה, נמחקה או אינה נגישה לחשבון החברה',
      });
    }

    if (folder.mimeType !== GOOGLE_DRIVE.FOLDER_MIME_TYPE) {
      throw new BadRequestException({
        code: DRIVE_FOLDER_LINK_ERROR_CODES.NOT_FOLDER,
        message: 'יש לבחור תיקייה ולא קובץ או קיצור דרך',
      });
    }

    const isCompanyFolder =
      folder.id !== rootId &&
      (await this.callDrive(() =>
        this.isInside(folder.id, rootId, MAX_FOLDER_DEPTH),
      ));
    if (!isCompanyFolder) {
      throw new BadRequestException({
        code: DRIVE_FOLDER_LINK_ERROR_CODES.OUTSIDE_ROOT,
        message: 'יש לבחור תיקייה בתוך תיקיית החברה, ולא את תיקיית החברה עצמה',
      });
    }

    await this.assertOwnershipAvailable(
      folder.id,
      buildingId,
      excludedProjectId,
    );

    if (buildingId) {
      await this.assertApartmentLocation(folder, buildingId);
    }

    return folder;
  }

  async inspect(project: IProject): Promise<string[]> {
    if (!project.driveFolderId) {
      return [];
    }

    await this.resolve(
      project.driveFolderId,
      project.parentProjectId,
      project.id,
    );
    return this.missingFolders(
      project.driveFolderId,
      project,
      project.parentProjectId !== null,
    );
  }

  async assertRootClaimAvailable(
    folderId: string,
    buildingId: string | null,
    excludedProjectId: string | null,
    transaction: Transaction,
  ): Promise<void> {
    await this.assertOwnershipAvailable(
      folderId,
      buildingId,
      excludedProjectId,
      transaction,
    );
    if (!buildingId) {
      return;
    }

    const folder = await this.callDrive(
      (): Promise<IDriveFileMetadata | null> =>
        this.drive.getFileMetadata(folderId),
    );
    if (!folder || folder.trashed) {
      throw new NotFoundException('The claimed apartment root is unavailable');
    }

    await this.assertApartmentLocation(folder, buildingId, transaction);
  }
  async assertOwnershipAvailable(
    folderId: string,
    buildingId: string | null,
    excludedProjectId: string | null,
    transaction?: Transaction,
  ): Promise<void> {
    const owners = await this.projects.findDriveFolderOwners(transaction);
    const candidates = owners.filter((owner) => owner.id !== excludedProjectId);
    if (candidates.some((owner) => owner.driveFolderId === folderId)) {
      throw new ConflictException({
        code: DRIVE_FOLDER_LINK_ERROR_CODES.ALREADY_LINKED,
        message: 'התיקייה כבר משויכת לפרויקט אחר. יש לבחור תיקייה נפרדת',
      });
    }

    const parentIds = new Map<string, Promise<string[] | null>>();
    const foreignOwners = candidates.filter((owner) => owner.id !== buildingId);
    for (const batch of chunkItems(
      foreignOwners,
      DRIVE_FOLDER_LINK.OWNERSHIP_BATCH_SIZE,
    )) {
      const checks = await Promise.all(
        batch.map(async (owner) => {
          if (!owner.driveFolderId) {
            return false;
          }

          const ownedFolderId = owner.driveFolderId;
          const insideOwned = await this.callDrive(() =>
            this.isInside(folderId, ownedFolderId, MAX_FOLDER_DEPTH, parentIds),
          );
          const containsOwned = await this.callDrive(() =>
            this.isInside(ownedFolderId, folderId, MAX_FOLDER_DEPTH, parentIds),
          );
          const isOwnApartment =
            buildingId === null &&
            excludedProjectId !== null &&
            owner.parentProjectId === excludedProjectId;
          return insideOwned || (containsOwned && !isOwnApartment);
        }),
      );
      if (checks.some((overlaps) => overlaps)) {
        throw new ConflictException({
          code: DRIVE_FOLDER_LINK_ERROR_CODES.OVERLAP,
          message:
            'התיקייה מכילה תיקייה של פרויקט אחר או נמצאת בתוכה. יש לבחור תיקייה נפרדת',
        });
      }
    }
  }

  private async assertApartmentLocation(
    folder: IDriveFileMetadata,
    buildingId: string,
    transaction?: Transaction,
  ): Promise<void> {
    const building = await this.projects.findById(buildingId, transaction);
    if (
      !building ||
      building.parentProjectId ||
      !building.projectType?.canHaveApartments
    ) {
      throw new BadRequestException({
        code: DRIVE_FOLDER_LINK_ERROR_CODES.APARTMENT_LOCATION,
        message: 'יש לבחור פרויקט בניין תקין עבור תיקיית הדירה',
      });
    }

    const buildingFolderId = building.driveFolderId;
    if (!buildingFolderId) {
      throw new ConflictException({
        code: DRIVE_FOLDER_LINK_ERROR_CODES.APARTMENT_LOCATION,
        message: 'יש לחבר תחילה את תיקיית הבניין וליצור בה תיקיית דיירים',
      });
    }

    const children = await this.callDrive(() =>
      this.drive.listChildren(buildingFolderId),
    );
    const residents = children.filter(
      (item) => item.isFolder && item.name === APARTMENTS_FOLDER_NAME,
    );
    const residentsFolder = residents.at(0);
    const isApartmentLocation =
      residents.length === 1 &&
      residentsFolder &&
      folder.parents.length === 1 &&
      folder.parents.at(0) === residentsFolder.id;
    if (!isApartmentLocation) {
      throw new ConflictException({
        code: DRIVE_FOLDER_LINK_ERROR_CODES.APARTMENT_LOCATION,
        message:
          'תיקיית הדירה חייבת להיות בתוך תיקיית דיירים יחידה של הבניין. יש לסדר את המיקום ב-Drive ולנסות שוב',
      });
    }
  }

  private async missingFolders(
    folderId: string,
    project: IProject | null,
    isApartment: boolean,
  ): Promise<string[]> {
    const tree = await this.templates.getTree();
    const nodes = isApartment
      ? tree.filter((node) => node.name !== APARTMENTS_FOLDER_NAME)
      : tree;
    const missing = await this.inspectLevel(folderId, nodes, project, '');
    if (
      !isApartment &&
      project?.projectType?.canHaveApartments &&
      !nodes.some((node) => node.name === APARTMENTS_FOLDER_NAME)
    ) {
      const residents = await this.inspectLevel(
        folderId,
        [{ name: APARTMENTS_FOLDER_NAME, children: [] }],
        project,
        '',
      );
      return [...missing, ...residents];
    }

    return missing;
  }

  private async inspectLevel(
    folderId: string,
    nodes: IDriveFolderTemplate[],
    project: IProject | null,
    prefix: string,
  ): Promise<string[]> {
    if (nodes.length === 0) {
      return [];
    }

    const children = await this.callDrive(() =>
      this.drive.listChildren(folderId),
    );
    const results = await Promise.all(
      nodes.map(async (node) => {
        const name = project
          ? renderDriveFolderName(node.name, project)
          : node.name;
        const path = prefix ? `${prefix}/${name}` : name;
        const matches = children.filter(
          (child) => child.isFolder && child.name === name,
        );
        if (matches.length > 1) {
          throw new ConflictException({
            code: DRIVE_FOLDER_LINK_ERROR_CODES.AMBIGUOUS_TEMPLATE,
            message: `קיימות כמה תיקיות תואמות בנתיב ${path}. יש להסדיר את הכפילות ב-Drive ולנסות שוב`,
          });
        }

        const match = matches.at(0);
        if (!match) {
          return this.collectMissing(node, project, prefix);
        }

        return this.inspectLevel(match.id, node.children, project, path);
      }),
    );
    return results.flat();
  }

  private collectMissing(
    node: IDriveFolderTemplate,
    project: IProject | null,
    prefix: string,
  ): string[] {
    const name = project
      ? renderDriveFolderName(node.name, project)
      : node.name;
    const path = prefix ? `${prefix}/${name}` : name;
    return [
      path,
      ...node.children.flatMap((child) =>
        this.collectMissing(child, project, path),
      ),
    ];
  }

  private async isInside(
    folderId: string,
    rootId: string,
    depth: number,
    parentIds: Map<string, Promise<string[] | null>> = new Map(),
  ): Promise<boolean> {
    if (folderId === rootId) {
      return true;
    }

    const reachedCompanyRoot =
      folderId === this.drive.getProjectsRootFolderId();
    if (depth === 0 || reachedCompanyRoot) {
      return false;
    }

    const lookup =
      parentIds.get(folderId) ?? this.drive.findParentIds(folderId);
    parentIds.set(folderId, lookup);
    const parents = await lookup;
    const results = await Promise.all(
      (parents ?? []).map((parentId) =>
        this.isInside(parentId, rootId, depth - 1, parentIds),
      ),
    );
    return results.some((result) => result);
  }

  private async callDrive<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      const status = getDriveConnectionFailure(error);
      this.logger.error({
        error: status,
        status,
        message: 'Existing Drive folder validation failed',
      });
      if (status === DRIVE_CONNECTION_STATUS.AUTHENTICATION_FAILED) {
        throw new ServiceUnavailableException({
          code: DRIVE_FOLDER_LINK_ERROR_CODES.AUTHENTICATION_FAILED,
          message: 'האימות מול Google Drive נכשל. יש לפנות למנהל המערכת',
        });
      }

      const inaccessible =
        status === DRIVE_CONNECTION_STATUS.ACCESS_DENIED ||
        status === DRIVE_CONNECTION_STATUS.ROOT_NOT_FOUND;
      if (inaccessible) {
        throw new NotFoundException({
          code: DRIVE_FOLDER_LINK_ERROR_CODES.NOT_FOUND,
          message: 'התיקייה לא נמצאה, נמחקה או אינה נגישה לחשבון החברה',
        });
      }

      throw new BadGatewayException({
        code: DRIVE_FOLDER_LINK_ERROR_CODES.UNAVAILABLE,
        message: 'לא ניתן לבדוק את התיקייה כרגע. יש לנסות שוב',
      });
    }
  }
}
