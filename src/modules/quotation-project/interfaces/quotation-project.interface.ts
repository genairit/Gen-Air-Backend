import type { CustomerProjectKindType } from '@Modules/project/constants/customer-project.constant';

export interface IQuotationProject {
  createdAt: Date;
  updatedAt: Date;
  projectId: string;
  isPrimary: boolean;
  quotationId: string;
}
export interface IQuotationPrimaryProject {
  id: string;
  name: string;
  code: string;
  kind: CustomerProjectKindType;
}
export interface IQuotationPrimaryProjectRow extends IQuotationPrimaryProject {
  quotationId: string;
}
export interface IQuotationApartment {
  apartmentId: string;
  floor: number | null;
  apartmentNumber: string | null;
  endCustomerName: string | null;
}
export interface IQuotationApartmentLink extends IQuotationApartment {
  available: boolean;
}
export interface IQuotationApartmentLinkRow extends IQuotationApartmentLink {
  quotationId: string;
}
