import type {
  IQuotationApartment,
  IQuotationApartmentLink,
  IQuotationPrimaryProject,
} from '@Modules/quotation-project/interfaces/quotation-project.interface';

import type { IQuotation } from './quotation.interface';
import type { IQuotationTaskMetadata } from './task-quotation.interface';
import type { IQuotationLifecycleEvent } from './quotation-lifecycle.interface';
import type { QuotationProjectRoleType } from '../constants/quotation-sharing.constant';
import type { IQuotationItem } from '@Modules/quotation-item/interfaces/quotation-item.interface';
import type { IQuotationSection } from '@Modules/quotation-section/interfaces/quotation-section.interface';

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
export interface IQuotationDetailView
  extends IQuotationView, Partial<IQuotationTaskMetadata> {
  apartmentLinks: IQuotationApartmentLink[];
  lifecycleHistory: IQuotationLifecycleEvent[];
  primaryProject: IQuotationPrimaryProject | null;
}
export interface IProjectQuotationView extends IQuotationView {
  sharedCount: number;
  sharedFromCode: string | null;
  sharedApartmentNumbers: string[];
  projectRole: QuotationProjectRoleType;
}
export interface IProjectQuotationPage {
  total: number;
  nextCursor: string | null;
  items: IProjectQuotationView[];
}
export interface IQuotationApartmentOptions {
  apartments: IQuotationApartment[];
  building: IQuotationPrimaryProject;
}
