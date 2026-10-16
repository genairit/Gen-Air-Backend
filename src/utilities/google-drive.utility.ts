import { HttpStatus } from '@nestjs/common';
import { isObject } from './object.utility';
import { drive_v3 } from '@googleapis/drive';
import { GOOGLE_DRIVE } from '@Constants/google-drive.constant';
import { IDriveItem } from '@Interfaces/google-drive.interface';

const DRIVE_QUERY_SPECIAL_CHARACTERS = /['\\]/g;

const escapeDriveQueryValue = (value: string): string =>
  value.replace(DRIVE_QUERY_SPECIAL_CHARACTERS, '\\$&');

export const buildChildrenQuery = (parentId: string): string =>
  `'${escapeDriveQueryValue(parentId)}' in parents and trashed = false`;

export const buildChildrenOfAnyQuery = (parentIds: string[]): string => {
  const parentClauses = parentIds.map(
    (parentId) => `'${escapeDriveQueryValue(parentId)}' in parents`,
  );

  return `(${parentClauses.join(' or ')}) and trashed = false`;
};

export const buildChildFolderByNameQuery = (
  name: string,
  parentId: string,
): string =>
  `${buildChildrenQuery(parentId)} and mimeType = '${GOOGLE_DRIVE.FOLDER_MIME_TYPE}' and name = '${escapeDriveQueryValue(name)}'`;

export const toDriveItem = (file: drive_v3.Schema$File): IDriveItem | null => {
  if (!file.id || !file.name || !file.mimeType) {
    return null;
  }

  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    webViewLink: file.webViewLink ?? null,
    size: file.size ? Number(file.size) : null,
    isFolder: file.mimeType === GOOGLE_DRIVE.FOLDER_MIME_TYPE,
    modifiedTime: file.modifiedTime ? new Date(file.modifiedTime) : null,
  };
};

export const toDriveItems = (files: drive_v3.Schema$File[]): IDriveItem[] =>
  files.flatMap((file) => toDriveItem(file) ?? []);

export const isDriveNotFoundError = (error: unknown): boolean =>
  isObject(error) && error.status === HttpStatus.NOT_FOUND;
