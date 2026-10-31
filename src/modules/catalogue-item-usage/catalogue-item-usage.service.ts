import { Transaction } from 'sequelize';
import { Injectable } from '@nestjs/common';
import { CatalogueItemUsageRepository } from './catalogue-item-usage.repository';

@Injectable()
export class CatalogueItemUsageService {
  constructor(private readonly repository: CatalogueItemUsageRepository) {}
  counts(userId: string): Promise<Map<string, number>> {
    return this.repository.counts(userId);
  }
  record(
    userId: string,
    catalogueItemId: string,
    transaction: Transaction,
  ): Promise<void> {
    return this.repository.record(userId, catalogueItemId, transaction);
  }
}
