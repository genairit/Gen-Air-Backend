import { UserRoleType } from '@Constants/user-role.constant';
import { IUser } from '@Modules/user/interfaces/user.interface';
import { IProjectStage } from '@Modules/project-stage/interfaces/project-stage.interface';

export interface IProjectStageTransition {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  projectId: string;
  changedBy?: IUser;
  toStageId: string;
  note: string | null;
  changedById: string;
  toStage?: IProjectStage;
  fromStage?: IProjectStage;
  fromStageId: string | null;
  changedByRole: UserRoleType;
}

export interface IStageChange {
  changedBy: IUser;
  projectId: string;
  toStageId: string;
  note: string | null;
  fromStageId: string | null;
}

export type TProjectStageTransitionCreationAttributes = Pick<
  IProjectStageTransition,
  | 'projectId'
  | 'fromStageId'
  | 'toStageId'
  | 'changedById'
  | 'changedByRole'
  | 'note'
>;
