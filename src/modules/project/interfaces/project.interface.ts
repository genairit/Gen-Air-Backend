import {
  IProjectMember,
  IProjectMemberAssignment,
} from '@Modules/project-member/interfaces/project-member.interface';

import { IUser } from '@Modules/user/interfaces/user.interface';
import { ICursorPage } from '@Interfaces/cursor-page.interface';
import { PaymentTermsType } from '@Constants/payment-terms.constant';
import { ICustomer } from '@Modules/customer/interfaces/customer.interface';
import { IProjectType } from '@Modules/project-type/interfaces/project-type.interface';
import { ProjectDetailFieldSetType } from '@Constants/project-detail-field-set.constant';
import { IProjectStage } from '@Modules/project-stage/interfaces/project-stage.interface';

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
}

export interface IProjectContact {
  contactName: string | null;
  contactRole: string | null;
  contactPhone: string | null;
}

export interface IProjectPaymentTerms {
  paymentTermsNote: string | null;
  paymentTerms: PaymentTermsType | null;
}

export type TProjectIntake = IProjectAddress &
  IProjectContact &
  IProjectPaymentTerms;

export type TProjectIntakeInput = Partial<
  Omit<TProjectIntake, 'address' | 'addressCity'>
>;

export interface IProjectFieldSetTarget {
  isTypeChanging: boolean;
  fieldSet: ProjectDetailFieldSetType | null;
}

export interface IProjectIntakeChangeRequest extends IProjectFieldSetTarget {
  project: IProject;
  changes: TProjectIntakeInput;
}

export interface IProject extends IProjectCustomerDetails, TProjectIntake {
  id: string;
  code: string;
  name: string;
  stageId: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: IUser;
  createdById: string;
  notes: string | null;
  customer?: ICustomer;
  hasOwnTeam?: boolean;
  stage?: IProjectStage;
  projectTypeId: string;
  deletedAt: Date | null;
  parentProject?: IProject;
  customerId: string | null;
  priorityId: string | null;
  projectType?: IProjectType;
  members?: IProjectMember[];
  driveFolderId: string | null;
  prioritySyncedAt: Date | null;
  parentProjectId: string | null;
}

export interface IProjectFilter {
  search: string | null;
  stageId: string | null;
  projectIds: string[] | null;
  projectTypeId: string | null;
  parentProjectId: string | null;
}

export type TProjectCreationAttributes = IProjectCustomerDetails &
  TProjectIntake &
  Pick<
    IProject,
    'code' | 'name' | 'projectTypeId' | 'stageId' | 'createdById'
  > &
  Partial<
    Pick<IProject, 'customerId' | 'parentProjectId' | 'hasOwnTeam' | 'notes'>
  >;

export type TProjectUpdateAttributes = Partial<
  IProjectCustomerDetails &
    TProjectIntake &
    Pick<
      IProject,
      | 'name'
      | 'projectTypeId'
      | 'stageId'
      | 'customerId'
      | 'hasOwnTeam'
      | 'notes'
    >
>;

export interface INewProjectContext {
  creator: IUser;
  members: IProjectMemberAssignment[];
}

export type TInheritedProjectField = keyof Pick<
  IProject,
  | 'address'
  | 'addressCity'
  | 'paymentTerms'
  | 'addressPlaceId'
  | 'paymentTermsNote'
>;

export type TBuildingInheritance = Pick<
  IProject,
  TInheritedProjectField | 'notes' | 'members'
>;

export interface IApartmentInheritance {
  members: IProjectMember[];
  parentNotes: string | null;
  inheritedFields: TInheritedProjectField[];
}

export type TApartmentInheritanceInput = Pick<
  IProject,
  TInheritedProjectField | 'hasOwnTeam' | 'members'
> &
  Partial<Pick<IProject, 'customer'>>;

export type TResolvedApartment = IProject & IApartmentInheritance;

export interface IApartmentPage extends ICursorPage<TResolvedApartment> {
  total: number;
}

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
