import { ICustomer } from '@Modules/customer/interfaces/customer.interface';

export interface ICustomerContact {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  createdById: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  customer?: ICustomer;
  deletedAt: Date | null;
  customerId: string | null;
}

export interface ICustomerContactValues {
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
}

export type TCustomerContactCreation = ICustomerContactValues & {
  createdById: string;
  customerId: string | null;
};
