import {
  IDriveTreeLevel,
  TRootIdByFolderId,
  TFileCountByFolderId,
} from '@Interfaces/google-drive.interface';

import { drive_v3 } from '@googleapis/drive';
import { GOOGLE_DRIVE } from '@Constants/google-drive.constant';

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
