import {
  addFileCounts,
  tallyTreeLevel,
  uniqueTreeFiles,
  collectFileTreeLevel,
} from '@Utilities/drive-tree.utility';

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
  IDriveFileMove,
  IDriveTreeFile,
  IDriveTreeWalk,
  IDriveFileMetadata,
  IDriveFileTreeWalk,
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

import type {
  IPublicationDriveFile,
  IPublicationDriveMedia,
  IPublicationDriveCreate,
} from './interfaces/publication-drive.interface';

import { Readable } from 'node:stream';
import { createReadStream } from 'node:fs';
import { Injectable } from '@nestjs/common';
import { drive, drive_v3 } from '@googleapis/drive';
import { chunkItems } from '@Utilities/array.utility';
import { Meta, TypedLogger } from '@Logger/logger.service';
import { GOOGLE_DRIVE } from '@Constants/google-drive.constant';
import { createDriveAuth } from './utilities/drive-auth.utility';
import { EnvironmentManager } from '@Utilities/environment-manager.utility';
import { IDriveConnectionResult } from './interfaces/drive-connection.interface';
import { PUBLICATION_LIMITS } from '@Modules/quotation-publication/constants/publication.constant';

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

  private publicationStopped = false;
  stopPublicationEffects(): void {
    this.publicationStopped = true;
  }
  private assertPublicationRunning(): void {
    if (this.publicationStopped) {
      throw new Error('Publication executor is draining');
    }
  }
  async listPublicationChildren(
    folderId: string,
    pageToken: string | null = null,
  ): Promise<IDriveItem[]> {
    this.assertPublicationRunning();
    const { data } = await this.drive.files.list(
      {
        ...LIST_OPTIONS,
        q: buildChildrenQuery(folderId),
        fields: `nextPageToken, files(${GOOGLE_DRIVE.ITEM_FIELDS})`,
        ...(pageToken ? { pageToken } : {}),
      },
      { timeout: PUBLICATION_LIMITS.DRIVE_TIMEOUT_MS, retry: false },
    );
    const files = toDriveItems(data.files ?? []);
    if (!data.nextPageToken) {
      return files;
    }

    return [
      ...files,
      ...(await this.listPublicationChildren(folderId, data.nextPageToken)),
    ];
  }
  async reservePublicationId(): Promise<string> {
    this.assertPublicationRunning();
    const { data } = await this.drive.files.generateIds(
      { count: 1, space: 'drive', type: 'files' },
      { timeout: PUBLICATION_LIMITS.DRIVE_TIMEOUT_MS, retry: false },
    );
    const id = data.ids?.at(0);
    if (!id) {
      throw new Error('Drive did not reserve an identity');
    }

    return id;
  }
  async inspectPublicationFile(
    id: string,
  ): Promise<IPublicationDriveFile | null> {
    this.assertPublicationRunning();
    try {
      const { data } = await this.drive.files.get(
        {
          ...SHARED_DRIVE_OPTIONS,
          fileId: id,
          fields:
            'id,name,mimeType,parents,trashed,md5Checksum,headRevisionId,appProperties',
        },
        { timeout: PUBLICATION_LIMITS.DRIVE_TIMEOUT_MS, retry: false },
      );
      if (!data.id || !data.mimeType) {
        throw new Error('Incomplete Drive metadata');
      }

      return {
        id: data.id,
        name: data.name ?? '',
        mimeType: data.mimeType,
        parents: data.parents ?? [],
        trashed: data.trashed ?? false,
        md5: data.md5Checksum ?? null,
        revisionId: data.headRevisionId ?? null,
        properties: data.appProperties ?? {},
      };
    } catch (error: unknown) {
      if (isDriveNotFoundError(error)) {
        return null;
      }

      throw error;
    }
  }
  async createPublicationFile(input: IPublicationDriveCreate): Promise<void> {
    this.assertPublicationRunning();
    const media = input.bytes
      ? {
          media: { mimeType: input.mimeType, body: Readable.from(input.bytes) },
        }
      : {};
    await this.drive.files.create(
      {
        ...SHARED_DRIVE_OPTIONS,
        ...media,
        fields: 'id',
        keepRevisionForever: input.bytes !== null,
        requestBody: {
          id: input.id,
          name: input.name,
          parents: [input.parentId],
          mimeType: input.mimeType,
          appProperties: input.properties,
        },
      },
      { timeout: PUBLICATION_LIMITS.DRIVE_TIMEOUT_MS, retry: false },
    );
  }
  async replacePublicationMedia(input: IPublicationDriveMedia): Promise<void> {
    this.assertPublicationRunning();
    await this.drive.files.update(
      {
        ...SHARED_DRIVE_OPTIONS,
        fileId: input.id,
        keepRevisionForever: true,
        fields: 'id',
        requestBody: { name: input.name },
        media: {
          mimeType: GOOGLE_DRIVE.PDF_MIME_TYPE,
          body: Readable.from(input.bytes),
        },
      },
      { timeout: PUBLICATION_LIMITS.DRIVE_TIMEOUT_MS, retry: false },
    );
  }
  async retainPublicationRevision(
    fileId: string,
    revisionId: string,
    expectedMd5: string,
  ): Promise<void> {
    this.assertPublicationRunning();
    await this.drive.revisions.update(
      {
        fileId,
        revisionId,
        requestBody: { keepForever: true },
        fields: 'id,keepForever,md5Checksum',
      },
      { timeout: PUBLICATION_LIMITS.DRIVE_TIMEOUT_MS, retry: false },
    );
    this.assertPublicationRunning();
    const { data } = await this.drive.revisions.get(
      { fileId, revisionId, fields: 'id,keepForever,md5Checksum' },
      { timeout: PUBLICATION_LIMITS.DRIVE_TIMEOUT_MS, retry: false },
    );
    if (
      data.id !== revisionId ||
      data.keepForever !== true ||
      data.md5Checksum !== expectedMd5
    ) {
      throw new Error('Drive did not retain the PDF revision');
    }
  }
  async movePublicationFile(
    fileId: string,
    sourceParents: string[],
    destinationId: string,
  ): Promise<void> {
    this.assertPublicationRunning();
    const removeParents = sourceParents
      .filter((parent): boolean => parent !== destinationId)
      .join(',');
    const addParents = sourceParents.includes(destinationId)
      ? {}
      : { addParents: destinationId };
    await this.drive.files.update(
      {
        ...SHARED_DRIVE_OPTIONS,
        ...addParents,
        ...(removeParents ? { removeParents } : {}),
        fileId,
        fields: 'id',
      },
      { timeout: PUBLICATION_LIMITS.DRIVE_TIMEOUT_MS, retry: false },
    );
  }

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

  async listDescendantFiles(
    rootFolderId: string,
    maxDepth: number,
  ): Promise<IDriveTreeFile[]> {
    const files = await this.collectRemainingFiles({
      files: [],
      depthLeft: maxDepth,
      folderPaths: new Map([[rootFolderId, '']]),
    });

    return uniqueTreeFiles(files);
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
        fields: 'parents,trashed',
      });

      return data.trashed ? null : (data.parents ?? []);
    } catch (error) {
      if (isDriveNotFoundError(error)) {
        return null;
      }

      throw error;
    }
  }

  async getFileMetadata(fileId: string): Promise<IDriveFileMetadata | null> {
    try {
      const { data } = await this.drive.files.get({
        ...SHARED_DRIVE_OPTIONS,
        fileId,
        fields: GOOGLE_DRIVE.FILE_METADATA_FIELDS,
      });
      if (!data.id || !data.mimeType) {
        return null;
      }

      return {
        id: data.id,
        ...(data.name ? { name: data.name } : {}),
        mimeType: data.mimeType,
        parents: data.parents ?? [],
        trashed: data.trashed ?? false,
        ...(data.version ? { version: data.version } : {}),
      };
    } catch (error) {
      if (isDriveNotFoundError(error)) {
        return null;
      }

      throw error;
    }
  }

  async downloadFile(fileId: string, maxBytes: number): Promise<Buffer> {
    const response = await this.drive.files.get(
      { ...SHARED_DRIVE_OPTIONS, fileId, alt: 'media' },
      { responseType: 'stream' },
    );
    const stream = response.data;
    const chunks: Buffer[] = [];
    const state = { size: 0 };
    for await (const part of stream) {
      const chunk = Buffer.from(part as Uint8Array);
      state.size += chunk.length;
      if (state.size > maxBytes) {
        stream.destroy();
        throw new RangeError('Drive file exceeds the email attachment limit');
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async moveFile({
    fileId,
    parentIds,
    destinationFolderId,
  }: IDriveFileMove): Promise<void> {
    await this.drive.files.update({
      ...SHARED_DRIVE_OPTIONS,
      fileId,
      fields: 'id',
      addParents: destinationFolderId,
      removeParents: parentIds.join(','),
    });
  }

  async trashFile(fileId: string): Promise<void> {
    await this.drive.files.update({
      ...SHARED_DRIVE_OPTIONS,
      fileId,
      fields: 'id',
      requestBody: { trashed: true },
    });
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

  private async collectRemainingFiles(
    walk: IDriveFileTreeWalk,
  ): Promise<IDriveTreeFile[]> {
    if (walk.folderPaths.size === 0) {
      return walk.files;
    }

    if (walk.depthLeft === 0) {
      throw new Error('Drive folder tree is deeper than the supported depth');
    }

    const children = await this.listChildrenOfAny(
      [...walk.folderPaths.keys()],
      GOOGLE_DRIVE.FILE_TREE_FIELDS,
    );
    const level = collectFileTreeLevel(children, walk.folderPaths);

    return this.collectRemainingFiles({
      depthLeft: walk.depthLeft - 1,
      folderPaths: level.folderPaths,
      files: [...walk.files, ...level.files],
    });
  }

  private async listChildrenOfAny(
    parentIds: string[],
    fields: string = GOOGLE_DRIVE.TREE_FIELDS,
  ): Promise<drive_v3.Schema$File[]> {
    const parentBatches = chunkItems(parentIds, GOOGLE_DRIVE.PARENTS_PER_QUERY);
    const childBatches = await Promise.all(
      parentBatches.map((batch) =>
        this.listAll(buildChildrenOfAnyQuery(batch), fields),
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
