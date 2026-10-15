export const DRIVE_CONNECTION_STATUS = {
  READY: 'ready',
  UNAVAILABLE: 'unavailable',
  INVALID_ROOT: 'invalid_root',
  ACCESS_DENIED: 'access_denied',
  ROOT_NOT_FOUND: 'root_not_found',
  NOT_CONFIGURED: 'not_configured',
  UNSUPPORTED_LOCATION: 'unsupported_location',
  AUTHENTICATION_FAILED: 'authentication_failed',
  INSUFFICIENT_PERMISSIONS: 'insufficient_permissions',
} as const;
export type DriveConnectionStatusType =
  (typeof DRIVE_CONNECTION_STATUS)[keyof typeof DRIVE_CONNECTION_STATUS];
export const DRIVE_CONNECTION_COPY: Record<DriveConnectionStatusType, string> =
  {
    ready:
      'The Shared Drive folder is reachable and reports list, create and trash permissions. No files were changed.',
    unavailable:
      'Drive could not be checked. Verify credentials, Drive API enablement and network access.',
    invalid_root:
      'The configured root must be an existing, non-trashed folder.',
    access_denied:
      'Drive rejected access. Verify that the Drive API is enabled and the service account has access to the Shared Drive.',
    root_not_found:
      'The configured root was not found or is not visible to the service account.',
    not_configured:
      'Set GOOGLE_DRIVE_ROOT_FOLDER_ID and configure service-account credentials.',
    unsupported_location:
      'Use a folder in a Shared Drive so the company owns newly created files.',
    authentication_failed:
      'Drive authentication failed. Verify the configured service-account credentials.',
    insufficient_permissions:
      'The folder is reachable, but list/create/trash permissions are missing. Check the Shared Drive Content manager role.',
  };
export const DRIVE_CONNECTION_METADATA_FIELDS =
  'id,name,mimeType,trashed,driveId,webViewLink,capabilities(canListChildren,canAddChildren,canTrashChildren)';
