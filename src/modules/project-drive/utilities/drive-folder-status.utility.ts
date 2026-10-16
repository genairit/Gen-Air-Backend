import {
  IDriveItem,
  TFileCountByFolderId,
} from '@Interfaces/google-drive.interface';

import {
  FOLDER_CONTENT_STATUS,
  FolderContentStatusType,
} from '../constants/project-drive.constant';

import { IProjectDriveFolder } from '../interfaces/project-drive.interface';

export const toFolderContentStatus = (
  fileCount: number | null,
): FolderContentStatusType => {
  if (fileCount === null) {
    return FOLDER_CONTENT_STATUS.UNKNOWN;
  }

  if (fileCount === 0) {
    return FOLDER_CONTENT_STATUS.EMPTY;
  }

  return FOLDER_CONTENT_STATUS.HAS_CONTENT;
};

export const toProjectDriveFolder = (
  folder: IDriveItem,
  fileCounts: TFileCountByFolderId | null,
): IProjectDriveFolder => {
  const fileCount = fileCounts?.get(folder.id) ?? null;

  return {
    id: folder.id,
    fileCount,
    name: folder.name,
    contentStatus: toFolderContentStatus(fileCount),
  };
};
