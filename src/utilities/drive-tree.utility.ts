import {
  IDriveTreeFile,
  TFolderPathById,
  IDriveTreeLevel,
  TRootIdByFolderId,
  IDriveFileTreeLevel,
  TFileCountByFolderId,
} from '@Interfaces/google-drive.interface';

import { uniqueBy } from './array.utility';
import { drive_v3 } from '@googleapis/drive';
import { toDriveItem } from './google-drive.utility';
import { GOOGLE_DRIVE } from '@Constants/google-drive.constant';

interface IPlacedDriveChild {
  id: string;
  name: string;
  parentPath: string;
  child: drive_v3.Schema$File;
}

const findRootId = (
  child: drive_v3.Schema$File,
  rootIdByFolderId: TRootIdByFolderId,
): string | null => {
  const parentIds = child.parents ?? [];
  const parentWithRoot = parentIds.find((parentId) =>
    rootIdByFolderId.has(parentId),
  );

  if (!parentWithRoot) {
    return null;
  }

  return rootIdByFolderId.get(parentWithRoot) ?? null;
};

export const tallyTreeLevel = (
  children: drive_v3.Schema$File[],
  rootIdByFolderId: TRootIdByFolderId,
): IDriveTreeLevel =>
  children.reduce<IDriveTreeLevel>(
    (level, child) => {
      const rootId = findRootId(child, rootIdByFolderId);

      if (!rootId || !child.id) {
        return level;
      }

      if (child.mimeType === GOOGLE_DRIVE.FOLDER_MIME_TYPE) {
        level.rootIdByFolderId.set(child.id, rootId);

        return level;
      }

      level.fileCounts.set(rootId, (level.fileCounts.get(rootId) ?? 0) + 1);

      return level;
    },
    { fileCounts: new Map(), rootIdByFolderId: new Map() },
  );

export const addFileCounts = (
  totals: TFileCountByFolderId,
  increments: TFileCountByFolderId,
): TFileCountByFolderId =>
  new Map(
    [...totals].map(([rootId, count]) => [
      rootId,
      count + (increments.get(rootId) ?? 0),
    ]),
  );

const findParentPath = (
  child: drive_v3.Schema$File,
  folderPaths: TFolderPathById,
): string | null => {
  const parentIds = child.parents ?? [];
  const walkedParentId = parentIds.find((parentId) =>
    folderPaths.has(parentId),
  );

  if (walkedParentId == null) {
    return null;
  }

  return folderPaths.get(walkedParentId) ?? null;
};

const joinFolderPath = (parentPath: string, name: string): string => {
  if (!parentPath) {
    return name;
  }

  return [parentPath, name].join(GOOGLE_DRIVE.FOLDER_PATH_SEPARATOR);
};

const toDriveTreeFile = (
  child: drive_v3.Schema$File,
  folderPath: string,
): IDriveTreeFile | null => {
  const item = toDriveItem(child);
  const isShortcut = child.mimeType === GOOGLE_DRIVE.SHORTCUT_MIME_TYPE;

  if (!item || isShortcut) {
    return null;
  }

  return { ...item, folderPath, md5Checksum: child.md5Checksum ?? null };
};

const placeChild = (
  child: drive_v3.Schema$File,
  folderPaths: TFolderPathById,
): IPlacedDriveChild[] => {
  const parentPath = findParentPath(child, folderPaths);

  const { id, name } = child;
  const isOutsideWalkedTree = parentPath === null;
  const isUnnamedChild = !id || !name;

  if (isOutsideWalkedTree || isUnnamedChild) {
    return [];
  }

  return [{ id, name, child, parentPath }];
};

const isPlacedFolder = (placed: IPlacedDriveChild): boolean =>
  placed.child.mimeType === GOOGLE_DRIVE.FOLDER_MIME_TYPE;

export const collectFileTreeLevel = (
  children: drive_v3.Schema$File[],
  folderPaths: TFolderPathById,
): IDriveFileTreeLevel => {
  const placedChildren = children.flatMap((child) =>
    placeChild(child, folderPaths),
  );

  return {
    folderPaths: new Map(
      placedChildren
        .filter(isPlacedFolder)
        .map((folder) => [
          folder.id,
          joinFolderPath(folder.parentPath, folder.name),
        ]),
    ),
    files: placedChildren
      .filter((placed) => !isPlacedFolder(placed))
      .flatMap(
        (placed) => toDriveTreeFile(placed.child, placed.parentPath) ?? [],
      ),
  };
};

export const uniqueTreeFiles = (files: IDriveTreeFile[]): IDriveTreeFile[] =>
  uniqueBy(files, (file) => file.id);
