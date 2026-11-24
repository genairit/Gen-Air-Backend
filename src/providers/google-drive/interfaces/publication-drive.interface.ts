export type TPublicationDriveProperties = Record<string, string>;
export interface IPublicationDriveFile {
  id: string;
  name: string;
  mimeType: string;
  trashed: boolean;
  parents: string[];
  md5: string | null;
  revisionId: string | null;
  properties: TPublicationDriveProperties;
}
export interface IPublicationDriveCreate {
  id: string;
  name: string;
  parentId: string;
  mimeType: string;
  bytes: Buffer | null;
  properties: TPublicationDriveProperties;
}
export interface IPublicationDriveMedia {
  id: string;
  name: string;
  bytes: Buffer;
}
