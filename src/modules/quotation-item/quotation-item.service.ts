import { Transaction } from 'sequelize';
import { Injectable } from '@nestjs/common';
import { QuotationItemRepository } from './quotation-item.repository';
import type { IQuotationItem } from './interfaces/quotation-item.interface';

@Injectable()
export class QuotationItemService {
  constructor(private readonly repository: QuotationItemRepository) {}
  list(
    parentIds: string[],
    transaction?: Transaction,
  ): ReturnType<QuotationItemRepository['list']> {
    return this.repository.list(parentIds, transaction);
  }
  remove(parentIds: string[], transaction: Transaction): Promise<void> {
    return this.repository.remove(parentIds, transaction);
  }
  persistCatalogueStatuses(
    items: IQuotationItem[],
    transaction: Transaction,
  ): Promise<void> {
    return this.repository.persistCatalogueStatuses(items, transaction);
  }
  insert(
    rows: Omit<IQuotationItem, 'createdAt' | 'updatedAt' | 'deletedAt'>[],
    transaction: Transaction,
  ): Promise<void> {
    return this.repository.insert(rows, transaction);
  }
}
