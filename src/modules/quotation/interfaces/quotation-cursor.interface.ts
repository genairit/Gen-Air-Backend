import type { TQuotationStatus } from '../constants/quotation.constant';

export interface IQuotationCursor {
  id: string;
  search: string;
  updatedAt: string;
  status: TQuotationStatus | null;
}
