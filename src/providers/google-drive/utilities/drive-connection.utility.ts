import {
  DRIVE_CONNECTION_COPY,
  DRIVE_CONNECTION_STATUS,
  DriveConnectionStatusType,
} from '../constants/drive-connection.constant';

import { drive_v3 } from '@googleapis/drive';
import { isObject } from '@Utilities/object.utility';
import { GOOGLE_DRIVE } from '@Constants/google-drive.constant';
import { IDriveConnectionResult } from '../interfaces/drive-connection.interface';

export const driveConnectionResult = (
  status: DriveConnectionStatusType,
): IDriveConnectionResult => ({
  status,
  message: DRIVE_CONNECTION_COPY[status],
  ready: status === DRIVE_CONNECTION_STATUS.READY,
  writesTested: false,
  folder: null,
  capabilities: null,
});

export const toDriveConnectionResult = (
  file: drive_v3.Schema$File,
): IDriveConnectionResult => {
  if (
    !file.id ||
    !file.name ||
    file.trashed === true ||
    file.mimeType !== GOOGLE_DRIVE.FOLDER_MIME_TYPE
  ) {
    return driveConnectionResult(DRIVE_CONNECTION_STATUS.INVALID_ROOT);
  }
  const capabilities = {
    canListChildren: file.capabilities?.canListChildren === true,
    canAddChildren: file.capabilities?.canAddChildren === true,
    canTrashChildren: file.capabilities?.canTrashChildren === true,
  };
  const hasRequiredPermissions = Object.values(capabilities).every(Boolean);
  const permissionStatus = hasRequiredPermissions
    ? DRIVE_CONNECTION_STATUS.READY
    : DRIVE_CONNECTION_STATUS.INSUFFICIENT_PERMISSIONS;
  const status = file.driveId
    ? permissionStatus
    : DRIVE_CONNECTION_STATUS.UNSUPPORTED_LOCATION;
  return {
    ...driveConnectionResult(status),
    capabilities,
    folder: {
      id: file.id,
      name: file.name,
      sharedDriveId: file.driveId ?? null,
      webViewLink: file.webViewLink ?? null,
    },
  };
};

export const getDriveConnectionFailure = (
  error: unknown,
): DriveConnectionStatusType => {
  if (!isObject(error)) {
    return DRIVE_CONNECTION_STATUS.UNAVAILABLE;
  }
  const response = isObject(error.response) ? error.response : null;
  const status = response?.status ?? error.code;
  const byStatus: Record<string, DriveConnectionStatusType> = {
    '401': DRIVE_CONNECTION_STATUS.AUTHENTICATION_FAILED,
    '403': DRIVE_CONNECTION_STATUS.ACCESS_DENIED,
    '404': DRIVE_CONNECTION_STATUS.ROOT_NOT_FOUND,
    ENOENT: DRIVE_CONNECTION_STATUS.AUTHENTICATION_FAILED,
  };
  const key =
    typeof status === 'number' || typeof status === 'string'
      ? String(status)
      : '';
  return Object.hasOwn(byStatus, key)
    ? byStatus[key]
    : DRIVE_CONNECTION_STATUS.UNAVAILABLE;
};
