export const GOOGLE_DRIVE = {
  PDF_MIME_TYPE: 'application/pdf',
  PAGE_SIZE: 1000,
  FILE_METADATA_FIELDS: 'id,name,mimeType,parents,trashed,version',
  SHORTCUT_MIME_TYPE: 'application/vnd.google-apps.shortcut',
  PROJECT_PROPERTY: 'genairProjectId',
  PARENTS_PER_QUERY: 40,
  ORDER_BY: 'folder,name',
  TREE_FIELDS: 'id, mimeType, parents',
  SCOPE: 'https://www.googleapis.com/auth/drive',
  FOLDER_MIME_TYPE: 'application/vnd.google-apps.folder',
  ITEM_FIELDS: 'id, name, mimeType, size, modifiedTime, webViewLink',
  FOLDER_PATH_SEPARATOR: '/',
  FILE_URL_PREFIX: 'https://drive.google.com/open?id=',
  FILE_TREE_FIELDS:
    'id, name, mimeType, size, modifiedTime, webViewLink, parents, md5Checksum',
} as const;

export const GOOGLE_DRIVE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
