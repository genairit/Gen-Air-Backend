import type { TSystemType } from '@Modules/quotation/constants/quotation.constant';

export interface IQuotationSection {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  quotationId: string;
  displayOrder: number;
  brand: string | null;
  deletedAt: Date | null;
  systemType: TSystemType;
}
