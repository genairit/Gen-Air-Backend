import { SaveQuotationDto } from '../dto/save-quotation.dto';
import { IQuotationDetailView } from '../interfaces/quotation-document.interface';

export const taskQuotationSaveInput = (
  quotation: IQuotationDetailView,
  changes: Partial<SaveQuotationDto> = {},
): SaveQuotationDto => ({
  brand: quotation.brand,
  date: quotation.date,
  brands: quotation.brands,
  version: quotation.version,
  customerId: quotation.customerId,
  projectId: quotation.projectId!,
  sections: quotation.sections,
  paymentTerms: quotation.paymentTerms,
  internalNotes: quotation.internalNotes,
  paymentSchedule: quotation.paymentSchedule,
  paymentTermsNote: quotation.paymentTermsNote,
  discountPercent: quotation.discountPercent,
  targetPretaxAmount: quotation.targetPretaxAmount,
  ...changes,
});
