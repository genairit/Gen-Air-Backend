import { IUser } from '@Modules/user/interfaces/user.interface';
import { IProjectType } from '@Modules/project-type/interfaces/project-type.interface';
import { IProjectStage } from '@Modules/project-stage/interfaces/project-stage.interface';
import { IProjectMember } from '@Modules/project-member/interfaces/project-member.interface';

export interface IProject {
  id: string;
  code: string;
  name: string;
  stageId: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: IUser;
  createdById: string;
  stage?: IProjectStage;
  projectTypeId: string;
  deletedAt: Date | null;
  erpSyncedAt: Date | null;
  projectType?: IProjectType;
  members?: IProjectMember[];
  erpReference: string | null;
  driveFolderId: string | null;
}

export interface IProjectFilter {
  search: string | null;
  stageId: string | null;
  projectIds: string[] | null;
  projectTypeId: string | null;
}

export type TProjectCreationAttributes = Pick<
  IProject,
  'code' | 'name' | 'projectTypeId' | 'stageId' | 'createdById'
>;

export type TProjectUpdateAttributes = Partial<
  Pick<IProject, 'name' | 'projectTypeId' | 'stageId'>
>;

export interface IProjectStageChangeRequest {
  changedBy: IUser;
  project: IProject;
  note: string | null;
  toStageId: string | null;
}

export interface IProjectStageCount {
  count: number;
  stageId: string;
}

export type TProjectCountsByStageId = Record<string, number>;

export interface IProjectStageCounts {
  total: number;
  byStage: TProjectCountsByStageId;
}
