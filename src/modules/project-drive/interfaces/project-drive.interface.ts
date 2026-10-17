import { IDriveItem } from '@Interfaces/google-drive.interface';
import { FolderContentStatusType } from '../constants/project-drive.constant';

export interface IProjectDriveFolder {
  id: string;
  name: string;
  fileCount: number | null;
  contentStatus: FolderContentStatusType;
}

export interface IProjectDriveContents {
  folderId: string;
  files: IDriveItem[];
  folders: IProjectDriveFolder[];
}
