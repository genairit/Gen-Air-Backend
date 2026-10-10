import { IUser } from '@Modules/user/interfaces/user.interface';
import { PaymentTermsType } from '@Constants/payment-terms.constant';
import { IProjectType } from '@Modules/project-type/interfaces/project-type.interface';
import { IProjectStage } from '@Modules/project-stage/interfaces/project-stage.interface';
import { IProjectMember } from '@Modules/project-member/interfaces/project-member.interface';

export interface IProjectCustomerDetails {
  customerName: string | null;
  customerCity: string | null;
  customerUnit: string | null;
  customerFloor: number | null;
  customerPhone: string | null;
  customerEmail: string | null;
  customerAddress: string | null;
  customerApartment: string | null;
  customerCompanyNumber: string | null;
  customerAssociationNumber: string | null;
}

export type ProjectCustomerDetailFieldType = keyof IProjectCustomerDetails;

export interface IProjectAddress {
  address: string | null;
  addressCity: string | null;
  addressPlaceId: string | null;
  addressLatitude: number | null;
  addressVerifiedAt: Date | null;
  addressLongitude: number | null;
}

export interface IProjectContact {
  contactName: string | null;
  contactRole: string | null;
  contactPhone: string | null;
}

export interface IProject
  extends IProjectCustomerDetails, IProjectAddress, IProjectContact {
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
  paymentTermsNote: string | null;
  paymentTerms: PaymentTermsType | null;
}

export interface IProjectFilter {
  search: string | null;
  stageId: string | null;
  projectIds: string[] | null;
  projectTypeId: string | null;
}

export type TProjectCreationAttributes = IProjectCustomerDetails &
  Pick<IProject, 'code' | 'name' | 'projectTypeId' | 'stageId' | 'createdById'>;

export type TProjectUpdateAttributes = Partial<
  IProjectCustomerDetails & Pick<IProject, 'name' | 'projectTypeId' | 'stageId'>
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
