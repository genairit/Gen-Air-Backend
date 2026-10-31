import { Transaction } from 'sequelize';
import { Injectable } from '@nestjs/common';
import { QuotationSectionRepository } from './quotation-section.repository';
import type { IQuotationSection } from './interfaces/quotation-section.interface';

@Injectable()
export class QuotationSectionService {
  constructor(private readonly repository: QuotationSectionRepository) {}
  list(
    parentIds: string[],
    transaction?: Transaction,
  ): ReturnType<QuotationSectionRepository['list']> {
    return this.repository.list(parentIds, transaction);
  }
  remove(parentIds: string[], transaction: Transaction): Promise<void> {
    return this.repository.remove(parentIds, transaction);
  }
  insert(
    rows: Omit<IQuotationSection, 'createdAt' | 'updatedAt' | 'deletedAt'>[],
    transaction: Transaction,
  ): Promise<void> {
    return this.repository.insert(rows, transaction);
  }
}
