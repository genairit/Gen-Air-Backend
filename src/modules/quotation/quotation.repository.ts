import { Injectable } from '@nestjs/common';
import { Op, Transaction } from 'sequelize';
import { Quotation } from './entities/quotation.entity';
import { toContainsPattern } from '@Utilities/query.utility';
import type { GetQuotationsDto } from './dto/get-quotations.dto';
import type { IQuotation } from './interfaces/quotation.interface';
import type { IQuotationCursor } from './interfaces/quotation-cursor.interface';

@Injectable()
export class QuotationRepository {
  findById(id: string, transaction?: Transaction): Promise<Quotation | null> {
    return Quotation.findByPk(id, {
      transaction,
      lock: transaction?.LOCK.UPDATE,
    });
  }
  async list(
    query: GetQuotationsDto,
    cursor: IQuotationCursor | null,
    transaction: Transaction,
  ): Promise<Quotation[]> {
    const database = Quotation.sequelize;
    if (!database) {
      throw new Error('Quotation database unavailable');
    }
    return database.query(
      `SELECT q.*,c.name AS "customerName",p.name AS "projectName" FROM quotations q LEFT JOIN customers c ON c.id=q.customer_id LEFT JOIN projects p ON p.id=q.project_id WHERE q.deleted_at IS NULL AND ($status::text IS NULL OR q.status=$status) AND concat_ws(' ',q.number,q.brand,c.name,p.name) ILIKE $search AND ($cursorDate::timestamptz IS NULL OR (q.updated_at,q.id)<($cursorDate::timestamptz,$cursorId::uuid)) ORDER BY q.updated_at DESC,q.id DESC LIMIT $limit`,
      {
        model: Quotation,
        mapToModel: true,
        transaction,
        bind: {
          status: query.status ?? null,
          search: toContainsPattern((query.search ?? '').trim()),
          cursorDate: cursor?.updatedAt ?? null,
          cursorId: cursor?.id ?? null,
          limit: (query.batchSize ?? 20) + 1,
        },
      },
    );
  }
  async nextNumber(prefix: string, transaction: Transaction): Promise<string> {
    const previous = await Quotation.findOne({
      where: { number: { [Op.like]: `${prefix}-%` } },
      order: [['number', 'DESC']],
      paranoid: false,
      transaction,
    });
    const next = previous ? Number(previous.number.split('-')[1]) + 1 : 1;
    return `${prefix}-${String(next).padStart(6, '0')}`;
  }
  create(
    attributes: Omit<IQuotation, 'createdAt' | 'updatedAt' | 'deletedAt'>,
    transaction: Transaction,
  ): Promise<Quotation> {
    return Quotation.create(attributes, { transaction });
  }
  async update(
    id: string,
    changes: Partial<IQuotation>,
    transaction: Transaction,
  ): Promise<void> {
    await Quotation.update(changes, { where: { id }, transaction });
  }
}
