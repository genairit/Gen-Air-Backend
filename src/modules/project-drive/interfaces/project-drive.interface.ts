import { IDriveItem } from '@Interfaces/google-drive.interface';

export interface IProjectDriveFolder {
  id: string;
  name: string;
  fileCount: number;
}

export interface IProjectDriveContents {
  folderId: string;
  files: IDriveItem[];
  folders: IProjectDriveFolder[];
}
