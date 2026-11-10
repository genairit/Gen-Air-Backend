import type {
  IQuotationApartment,
  IQuotationApartmentLink,
  IQuotationPrimaryProject,
} from '@Modules/quotation-project/interfaces/quotation-project.interface';

import type { IQuotation } from './quotation.interface';
import type { QuotationProjectRoleType } from '../constants/quotation-sharing.constant';
import type { IQuotationItem } from '@Modules/quotation-item/interfaces/quotation-item.interface';
import type { IQuotationSection } from '@Modules/quotation-section/interfaces/quotation-section.interface';

export interface IPaymentStage {
  text: string;
  percent: string;
}
export interface IQuotationSectionDocument extends IQuotationSection {
  items: IQuotationItem[];
}
export interface IQuotationDocument extends IQuotation {
  projectId: string | null;
  ruleConfigFingerprint: string;
  sections: IQuotationSectionDocument[];
}
export interface IQuotationWarning {
  key: string;
  text: string;
  acknowledged: boolean;
}
export interface IQuotationTotals {
  vat: string;
  total: string;
  pretax: string;
  subtotal: string;
  discount: string;
}
export interface IQuotationView extends IQuotationDocument {
  totals: IQuotationTotals;
  warnings: IQuotationWarning[];
  salesAgentName?: string | null;
}
export interface IQuotationDetailView extends IQuotationView {
  apartmentLinks: IQuotationApartmentLink[];
  primaryProject: IQuotationPrimaryProject | null;
}
export interface IProjectQuotationView extends IQuotationView {
  sharedCount: number;
  sharedFromCode: string | null;
  sharedApartmentNumbers: string[];
  projectRole: QuotationProjectRoleType;
}
export interface IQuotationApartmentOptions {
  apartments: IQuotationApartment[];
  building: IQuotationPrimaryProject;
}
