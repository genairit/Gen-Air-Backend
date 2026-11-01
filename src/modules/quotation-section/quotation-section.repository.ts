import { Injectable } from '@nestjs/common';
import { Transaction, Op } from 'sequelize';
import { QuotationSection } from './entities/quotation-section.entity';
import type { IQuotationSection } from './interfaces/quotation-section.interface';

@Injectable()
export class QuotationSectionRepository {
  list(
    parentIds: string[],
    transaction?: Transaction,
  ): Promise<QuotationSection[]> {
    return QuotationSection.findAll({
      where: { quotationId: { [Op.in]: parentIds } },
      transaction,
      order: [['displayOrder', 'ASC']],
    });
  }
  async remove(parentIds: string[], transaction: Transaction): Promise<void> {
    await QuotationSection.destroy({
      where: { quotationId: { [Op.in]: parentIds } },
      transaction,
      force: true,
    });
  }
  async insert(
    rows: Omit<IQuotationSection, 'createdAt' | 'updatedAt' | 'deletedAt'>[],
    transaction: Transaction,
  ): Promise<void> {
    await QuotationSection.bulkCreate(rows, { transaction });
  }
}
