export const GOOGLE_DRIVE = {
  PAGE_SIZE: 1000,
  FILE_METADATA_FIELDS: 'id,mimeType,parents,trashed',
  SHORTCUT_MIME_TYPE: 'application/vnd.google-apps.shortcut',
  PROJECT_PROPERTY: 'genairProjectId',
  PARENTS_PER_QUERY: 40,
  ORDER_BY: 'folder,name',
  TREE_FIELDS: 'id, mimeType, parents',
  SCOPE: 'https://www.googleapis.com/auth/drive',
  FOLDER_MIME_TYPE: 'application/vnd.google-apps.folder',
  ITEM_FIELDS: 'id, name, mimeType, size, modifiedTime, webViewLink',
} as const;

export const GOOGLE_DRIVE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
