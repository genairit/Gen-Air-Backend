export interface IDriveItem {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  size: number | null;
  modifiedTime: Date | null;
  webViewLink: string | null;
}

export interface IDriveUpload {
  name: string;
  mimeType: string;
  parentId: string;
  localPath: string;
}
