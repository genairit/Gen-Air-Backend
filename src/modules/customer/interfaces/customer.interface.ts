import { IUser } from '@Modules/user/interfaces/user.interface';
import type { PaymentTermsType } from '@Constants/payment-terms.constant';
import { PrioritySyncStatusType } from '../constants/priority-sync-status.constant';
import { ProjectDetailFieldSetType } from '@Constants/project-detail-field-set.constant';
import { ICustomerContact } from '@Modules/customer-contact/interfaces/customer-contact.interface';

export interface ICustomer {
  id: string;
  name: string;
  taxId: string;
  address: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: IUser;
  createdById: string;
  phone: string | null;
  email: string | null;
  deletedAt: Date | null;
  priorityId: string | null;
  contactName: string | null;
  prioritySyncAttempts: number;
  prioritySyncedAt: Date | null;
  primaryContactId?: string | null;
  prioritySyncError: string | null;
  primaryContact?: ICustomerContact;
  paymentTerms?: PaymentTermsType | null;
  customerType: ProjectDetailFieldSetType;
  prioritySyncStatus: PrioritySyncStatusType;
}

export interface ICustomerFilter {
  search: string | null;
  prioritySyncStatus: PrioritySyncStatusType | null;
}

export interface ICustomerSyncStatusCount {
  count: number;
  prioritySyncStatus: PrioritySyncStatusType;
}

export type TCustomerSyncStatusCounts = Record<PrioritySyncStatusType, number>;

type TCustomerEditableField =
  | 'paymentTerms'
  | 'name'
  | 'phone'
  | 'email'
  | 'taxId'
  | 'address'
  | 'contactName'
  | 'customerType';

export type TCustomerCreationAttributes = Pick<
  ICustomer,
  TCustomerEditableField | 'createdById'
> &
  Partial<Pick<ICustomer, 'primaryContactId'>>;

export type TCustomerUpdateAttributes = Partial<
  Pick<ICustomer, TCustomerEditableField | 'primaryContactId'>
>;
