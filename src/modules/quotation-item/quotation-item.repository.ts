import { Injectable } from '@nestjs/common';
import { Transaction, Op } from 'sequelize';
import { QuotationItem } from './entities/quotation-item.entity';
import type { IQuotationItem } from './interfaces/quotation-item.interface';

@Injectable()
export class QuotationItemRepository {
  list(
    parentIds: string[],
    transaction?: Transaction,
  ): Promise<QuotationItem[]> {
    return QuotationItem.findAll({
      where: { sectionId: { [Op.in]: parentIds } },
      transaction,
      order: [['displayOrder', 'ASC']],
    });
  }
  async remove(parentIds: string[], transaction: Transaction): Promise<void> {
    await QuotationItem.destroy({
      where: { sectionId: { [Op.in]: parentIds } },
      transaction,
      force: true,
    });
  }
  async persistCatalogueStatuses(
    items: IQuotationItem[],
    transaction: Transaction,
  ): Promise<void> {
    await QuotationItem.bulkCreate(items, {
      transaction,
      updateOnDuplicate: ['catalogueStatus'],
    });
  }
  async insert(
    rows: Omit<IQuotationItem, 'createdAt' | 'updatedAt' | 'deletedAt'>[],
    transaction: Transaction,
  ): Promise<void> {
    await QuotationItem.bulkCreate(rows, { transaction });
  }
}
