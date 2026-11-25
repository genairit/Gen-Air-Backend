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

export type TFileCountByFolderId = Map<string, number>;

export type TFolderPathById = Map<string, string>;

export interface IDriveTreeFile extends IDriveItem {
  folderPath: string;
  md5Checksum: string | null;
}

export interface IDriveFileTreeLevel {
  files: IDriveTreeFile[];
  folderPaths: TFolderPathById;
}

export interface IDriveFileTreeWalk {
  depthLeft: number;
  files: IDriveTreeFile[];
  folderPaths: TFolderPathById;
}

export type TRootIdByFolderId = Map<string, string>;

export interface IDriveTreeLevel {
  fileCounts: TFileCountByFolderId;
  rootIdByFolderId: TRootIdByFolderId;
}

export interface IDriveTreeWalk extends IDriveTreeLevel {
  depthLeft: number;
}

export interface IDriveFileMetadata {
  id: string;
  name?: string;
  trashed: boolean;
  mimeType: string;
  version?: string;
  parents: string[];
}

export interface IDriveFileMove {
  fileId: string;
  parentIds: string[];
  destinationFolderId: string;
}
