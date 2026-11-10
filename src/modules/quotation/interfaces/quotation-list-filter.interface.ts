import type { TQuotationStatus } from '../constants/quotation.constant';

export interface IQuotationListFilter {
  search?: string;
  batchSize?: number;
  projectId: string | null;
  status?: TQuotationStatus;
}
