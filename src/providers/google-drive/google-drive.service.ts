import {
  toDriveItem,
  toDriveItems,
  buildChildrenQuery,
  isDriveNotFoundError,
  buildChildFilesQuery,
  buildChildFolderByNameQuery,
} from '@Utilities/google-drive.utility';

import { createReadStream } from 'node:fs';
import { Injectable } from '@nestjs/common';
import { auth, drive, drive_v3 } from '@googleapis/drive';
import { GOOGLE_DRIVE } from '@Constants/google-drive.constant';
import { EnvironmentManager } from '@Utilities/environment-manager.utility';
import { IDriveItem, IDriveUpload } from '@Interfaces/google-drive.interface';

const SHARED_DRIVE_OPTIONS = { supportsAllDrives: true } as const;

const LIST_OPTIONS = {
  ...SHARED_DRIVE_OPTIONS,
  orderBy: GOOGLE_DRIVE.ORDER_BY,
  pageSize: GOOGLE_DRIVE.PAGE_SIZE,
  includeItemsFromAllDrives: true,
} as const;

@Injectable()
export class GoogleDriveService {
  private readonly drive = drive({
    version: 'v3',
    auth: new auth.GoogleAuth({ scopes: [GOOGLE_DRIVE.SCOPE] }),
  });

  getProjectsRootFolderId(): string | null {
    return EnvironmentManager.get('GOOGLE_DRIVE_ROOT_FOLDER_ID') || null;
  }

  isConfigured(): boolean {
    return this.getProjectsRootFolderId() !== null;
  }

  async listChildren(folderId: string): Promise<IDriveItem[]> {
    const files = await this.listAll(
      buildChildrenQuery(folderId),
      GOOGLE_DRIVE.ITEM_FIELDS,
    );

    return toDriveItems(files);
  }

  async countFiles(folderId: string): Promise<number> {
    const files = await this.listAll(buildChildFilesQuery(folderId), 'id');

    return files.length;
  }

  async ensureFolder(name: string, parentId: string): Promise<string> {
    const existingFolderId = await this.findChildFolderId(name, parentId);

    if (existingFolderId) {
      return existingFolderId;
    }

    return this.createFolder(name, parentId);
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

  private async findChildFolderId(
    name: string,
    parentId: string,
  ): Promise<string | null> {
    const folders = await this.listAll(
      buildChildFolderByNameQuery(name, parentId),
      'id',
    );

    return folders.at(0)?.id ?? null;
  }

  private async createFolder(name: string, parentId: string): Promise<string> {
    const { data } = await this.drive.files.create({
      ...SHARED_DRIVE_OPTIONS,
      fields: GOOGLE_DRIVE.ITEM_FIELDS,
      requestBody: {
        name,
        parents: [parentId],
        mimeType: GOOGLE_DRIVE.FOLDER_MIME_TYPE,
      },
    });

    return this.requireItem(data).id;
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
