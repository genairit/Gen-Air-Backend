import {
  toDriveItem,
  toDriveItems,
  buildChildrenQuery,
  isDriveNotFoundError,
  buildProjectFolderQuery,
  buildChildrenOfAnyQuery,
  buildChildFolderByNameQuery,
} from '@Utilities/google-drive.utility';

import {
  IDriveItem,
  IDriveUpload,
  IDriveTreeWalk,
  TFileCountByFolderId,
} from '@Interfaces/google-drive.interface';

import {
  driveConnectionResult,
  toDriveConnectionResult,
  getDriveConnectionFailure,
} from './utilities/drive-connection.utility';

import {
  DRIVE_CONNECTION_STATUS,
  DRIVE_CONNECTION_METADATA_FIELDS,
} from './constants/drive-connection.constant';

import { createReadStream } from 'node:fs';
import { Injectable } from '@nestjs/common';
import { drive, drive_v3 } from '@googleapis/drive';
import { chunkItems } from '@Utilities/array.utility';
import { Meta, TypedLogger } from '@Logger/logger.service';
import { GOOGLE_DRIVE } from '@Constants/google-drive.constant';
import { createDriveAuth } from './utilities/drive-auth.utility';
import { EnvironmentManager } from '@Utilities/environment-manager.utility';
import { addFileCounts, tallyTreeLevel } from '@Utilities/drive-tree.utility';
import { IDriveConnectionResult } from './interfaces/drive-connection.interface';

const SHARED_DRIVE_OPTIONS = { supportsAllDrives: true } as const;

const LIST_OPTIONS = {
  ...SHARED_DRIVE_OPTIONS,
  orderBy: GOOGLE_DRIVE.ORDER_BY,
  pageSize: GOOGLE_DRIVE.PAGE_SIZE,
  includeItemsFromAllDrives: true,
} as const;

@Injectable()
export class GoogleDriveService {
  private readonly logger = new TypedLogger<Meta>(GoogleDriveService.name);
  private readonly drive = drive({
    version: 'v3',
    auth: createDriveAuth(),
  });

  getProjectsRootFolderId(): string | null {
    return EnvironmentManager.get('GOOGLE_DRIVE_ROOT_FOLDER_ID') || null;
  }

  isConfigured(): boolean {
    return this.getProjectsRootFolderId() !== null;
  }

  async checkConnection(): Promise<IDriveConnectionResult> {
    const rootId = this.getProjectsRootFolderId();
    if (!rootId) {
      return driveConnectionResult(DRIVE_CONNECTION_STATUS.NOT_CONFIGURED);
    }
    try {
      const { data } = await this.drive.files.get({
        ...SHARED_DRIVE_OPTIONS,
        fileId: rootId,
        fields: DRIVE_CONNECTION_METADATA_FIELDS,
      });
      return toDriveConnectionResult(data);
    } catch (error) {
      const status = getDriveConnectionFailure(error);
      this.logger.warn({
        status,
        message: 'Google Drive connection check failed',
      });
      return driveConnectionResult(status);
    }
  }

  async listChildren(folderId: string): Promise<IDriveItem[]> {
    const files = await this.listAll(
      buildChildrenQuery(folderId),
      GOOGLE_DRIVE.ITEM_FIELDS,
    );

    return toDriveItems(files);
  }

  async countDescendantFiles(
    rootFolderIds: string[],
    maxDepth: number,
  ): Promise<TFileCountByFolderId> {
    return this.countRemainingLevels({
      depthLeft: maxDepth,
      fileCounts: new Map(rootFolderIds.map((id) => [id, 0])),
      rootIdByFolderId: new Map(rootFolderIds.map((id) => [id, id])),
    });
  }

  async ensureFolder(
    name: string,
    parentId: string,
    projectId?: string,
  ): Promise<string> {
    const query = projectId
      ? buildProjectFolderQuery(projectId, parentId)
      : buildChildFolderByNameQuery(name, parentId);
    const folders = await this.listAll(query, 'id');
    const existingFolderId = folders.at(0)?.id;

    if (existingFolderId) {
      return existingFolderId;
    }

    return this.createFolder(name, parentId, projectId);
  }

  async findParentIds(fileId: string): Promise<string[] | null> {
    try {
      const { data } = await this.drive.files.get({
        ...SHARED_DRIVE_OPTIONS,
        fileId,
        fields: 'parents',
      });

      return data.parents ?? [];
    } catch (error) {
      if (isDriveNotFoundError(error)) {
        return null;
      }

      throw error;
    }
  }

  async uploadFile(upload: IDriveUpload): Promise<IDriveItem> {
    const body = createReadStream(upload.localPath);
    const { data } = await this.drive.files.create({
      ...SHARED_DRIVE_OPTIONS,
      fields: GOOGLE_DRIVE.ITEM_FIELDS,
      media: { mimeType: upload.mimeType, body },
      requestBody: { name: upload.name, parents: [upload.parentId] },
    });

    return this.requireItem(data);
  }

  private async createFolder(
    name: string,
    parentId: string,
    projectId?: string,
  ): Promise<string> {
    const { data } = await this.drive.files.create({
      ...SHARED_DRIVE_OPTIONS,
      fields: GOOGLE_DRIVE.ITEM_FIELDS,
      requestBody: {
        name,
        parents: [parentId],
        ...(projectId
          ? { appProperties: { [GOOGLE_DRIVE.PROJECT_PROPERTY]: projectId } }
          : {}),
        mimeType: GOOGLE_DRIVE.FOLDER_MIME_TYPE,
      },
    });

    return this.requireItem(data).id;
  }

  private async countRemainingLevels(
    walk: IDriveTreeWalk,
  ): Promise<TFileCountByFolderId> {
    if (walk.rootIdByFolderId.size === 0) {
      return walk.fileCounts;
    }

    if (walk.depthLeft === 0) {
      throw new Error('Drive folder tree is deeper than the supported depth');
    }

    const children = await this.listChildrenOfAny([
      ...walk.rootIdByFolderId.keys(),
    ]);
    const level = tallyTreeLevel(children, walk.rootIdByFolderId);

    return this.countRemainingLevels({
      depthLeft: walk.depthLeft - 1,
      rootIdByFolderId: level.rootIdByFolderId,
      fileCounts: addFileCounts(walk.fileCounts, level.fileCounts),
    });
  }

  private async listChildrenOfAny(
    parentIds: string[],
  ): Promise<drive_v3.Schema$File[]> {
    const parentBatches = chunkItems(parentIds, GOOGLE_DRIVE.PARENTS_PER_QUERY);
    const childBatches = await Promise.all(
      parentBatches.map((batch) =>
        this.listAll(buildChildrenOfAnyQuery(batch), GOOGLE_DRIVE.TREE_FIELDS),
      ),
    );

    return childBatches.flat();
  }

  private async listAll(
    query: string,
    fields: string,
    pageToken: string | null = null,
  ): Promise<drive_v3.Schema$File[]> {
    const { data } = await this.drive.files.list({
      ...LIST_OPTIONS,
      q: query,
      fields: `nextPageToken, files(${fields})`,
      ...(pageToken ? { pageToken } : {}),
    });

    const files = data.files ?? [];

    if (!data.nextPageToken) {
      return files;
    }

    const remainingFiles = await this.listAll(
      query,
      fields,
      data.nextPageToken,
    );

    return [...files, ...remainingFiles];
  }

  private requireItem(file: drive_v3.Schema$File): IDriveItem {
    const item = toDriveItem(file);

    if (!item) {
      throw new Error('Google Drive returned a file without an id or name');
    }

    return item;
  }
}
