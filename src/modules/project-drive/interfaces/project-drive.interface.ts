import type { Transaction } from 'sequelize';
import { IDriveItem } from '@Interfaces/google-drive.interface';
import type { IProject } from '@Modules/project/interfaces/project.interface';
import { FolderContentStatusType } from '../constants/project-drive.constant';
import type { DriveProvisioningModeType } from '../constants/project-drive.constant';
import type { IDriveTemplateFolderNode } from '@Modules/drive-template-folder/interfaces/drive-template-folder.interface';

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
  missingTemplateFolders?: string[];
}

export interface IProjectDriveProvisioning {
  projectId: string;
  transaction: Transaction;
  expectedRootId: string | null;
  mode: DriveProvisioningModeType;
}
export interface IProjectDriveTemplateContext {
  project: IProject;
  projectFolderId: string;
  templateNodes: IDriveTemplateFolderNode[];
}
export interface IProjectDriveTemplateFolders {
  project: IProject;
  parentFolderId: string;
  transaction: Transaction;
  templateNodes: IDriveTemplateFolderNode[];
}
