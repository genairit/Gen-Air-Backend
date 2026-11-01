import type { IQuotation } from './quotation.interface';
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
}
