import type {
  QuotationItemDto,
  SaveQuotationDto,
} from '../dto/save-quotation.dto';

import type { Transaction } from 'sequelize';
import type { IQuotationDocument } from './quotation-document.interface';
import type { IQuotationItem } from '@Modules/quotation-item/interfaces/quotation-item.interface';
import type { ICatalogueItem } from '@Modules/catalogue-item/interfaces/catalogue-item.interface';

export interface IQuotationSelectionRequest {
  userId: string;
  input: SaveQuotationDto;
  transaction: Transaction;
  current: IQuotationDocument;
}
export interface IQuotationSnapshotInput {
  sectionId: string;
  displayOrder: number;
  item: QuotationItemDto;
  catalogue: ICatalogueItem;
  previous: IQuotationItem | null;
}
