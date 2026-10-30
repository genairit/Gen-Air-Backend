import { IUser } from '@Modules/user/interfaces/user.interface';
import { ICursorPage } from '@Interfaces/cursor-page.interface';
import { IProject, IProjectStageCounts } from './project.interface';
import { CustomerProjectKindType } from '../constants/customer-project.constant';
import { IProjectType } from '@Modules/project-type/interfaces/project-type.interface';
import { IProjectStage } from '@Modules/project-stage/interfaces/project-stage.interface';

export interface ICustomerProjectScope {
  search: string;
  customerId: string;
  stageId: string | null;
}

export interface ICustomerProjectCursor extends ICustomerProjectScope {
  id: string;
  name: string;
  updatedAt: Date;
}

export interface ICustomerProjectMember {
  user: Pick<IUser, 'id' | 'firstName' | 'lastName'> | null;
}

export interface ICustomerProjectBuilding {
  id: string;
  name: string;
  code: string;
}

export interface ICustomerProjectItem {
  id: string;
  name: string;
  code: string;
  stageId: string;
  updatedAt: Date;
  apartmentCount: number;
  stage: IProjectStage | null;
  customerFloor: number | null;
  kind: CustomerProjectKindType;
  parentProjectId: string | null;
  projectType: IProjectType | null;
  members: ICustomerProjectMember[];
  building: ICustomerProjectBuilding | null;
}

export interface ICustomerProjectPage extends ICursorPage<ICustomerProjectItem> {
  total: number;
  counts: IProjectStageCounts;
}

export interface ICustomerProjectSource extends Pick<
  IProject,
  | 'id'
  | 'name'
  | 'code'
  | 'stageId'
  | 'updatedAt'
  | 'parentProjectId'
  | 'customerFloor'
  | 'hasOwnTeam'
  | 'members'
  | 'parentProject'
  | 'projectType'
  | 'stage'
> {
  apartmentCount: number;
}

export interface ICustomerProjectBatch {
  size: number;
  cursor: ICustomerProjectCursor | null;
}
