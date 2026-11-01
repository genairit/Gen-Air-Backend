import { ICustomer } from '@Modules/customer/interfaces/customer.interface';

export interface ICustomerContact {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  customerId: string;
  createdById: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  customer?: ICustomer;
  deletedAt: Date | null;
}

export interface ICustomerContactValues {
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
}

export interface ICustomerContactImport extends ICustomerContactValues {
  customerId: string;
  createdById: string;
}

export type TCustomerContactCreation = ICustomerContactImport;
