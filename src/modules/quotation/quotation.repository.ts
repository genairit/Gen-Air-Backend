import { Injectable } from '@nestjs/common';
import { Op, QueryTypes, Transaction } from 'sequelize';
import { Quotation } from './entities/quotation.entity';
import { toContainsPattern } from '@Utilities/query.utility';
import { QUOTATION_STATUS } from './constants/quotation.constant';
import type { IQuotation } from './interfaces/quotation.interface';
import { QUOTATION_QUERY } from './constants/quotation-query.constant';
import type { IQuotationCursor } from './interfaces/quotation-cursor.interface';
import type { IQuotationListFilter } from './interfaces/quotation-list-filter.interface';
import type { IQuotationStatusCounts } from './interfaces/quotation-status-counts.interface';

@Injectable()
export class QuotationRepository {
  findById(id: string, transaction?: Transaction): Promise<Quotation | null> {
    return Quotation.findByPk(id, {
      transaction,
      lock: transaction?.LOCK.UPDATE,
    });
  }
  async list(
    query: IQuotationListFilter,
    cursor: IQuotationCursor | null,
    transaction: Transaction,
  ): Promise<Quotation[]> {
    const database = Quotation.sequelize;
    if (!database) {
      throw new Error('Quotation database unavailable');
    }
    return database.query(
      `SELECT q.*,c.name AS "customerName",p.name AS "projectName" ${QUOTATION_QUERY.JOINS} WHERE ${QUOTATION_QUERY.SEARCH} AND ${QUOTATION_QUERY.PROJECT_SCOPE} AND ($status::text IS NULL OR q.status=$status) AND ($cursorDate::timestamptz IS NULL OR (q.updated_at,q.id)<($cursorDate::timestamptz,$cursorId::uuid)) ORDER BY q.updated_at DESC,q.id DESC LIMIT $limit`,
      {
        model: Quotation,
        mapToModel: true,
        transaction,
        bind: {
          projectId: query.projectId,
          status: query.status ?? null,
          search: toContainsPattern((query.search ?? '').trim()),
          cursorDate: cursor?.updatedAt ?? null,
          cursorId: cursor?.id ?? null,
          limit: (query.batchSize ?? 20) + 1,
        },
      },
    );
  }
  async statusCounts(search: string): Promise<IQuotationStatusCounts> {
    const database = Quotation.sequelize;
    if (!database) {
      throw new Error('Quotation database unavailable');
    }

    const [counts] = await database.query<IQuotationStatusCounts>(
      `SELECT count(*)::integer AS "all", count(*) FILTER (WHERE q.status=$draft)::integer AS draft, count(*) FILTER (WHERE q.status=$review)::integer AS review, count(*) FILTER (WHERE q.status=$approved)::integer AS approved, count(*) FILTER (WHERE q.status=$cancelled)::integer AS cancelled ${QUOTATION_QUERY.JOINS} WHERE ${QUOTATION_QUERY.SEARCH}`,
      {
        type: QueryTypes.SELECT,
        bind: {
          search: toContainsPattern(search.trim()),
          draft: QUOTATION_STATUS.DRAFT,
          review: QUOTATION_STATUS.REVIEW,
          approved: QUOTATION_STATUS.APPROVED,
          cancelled: QUOTATION_STATUS.CANCELLED,
        },
      },
    );
    return counts;
  }
  async countByProject(
    projectId: string,
    transaction: Transaction,
  ): Promise<number> {
    const database = Quotation.sequelize;
    if (!database) {
      throw new Error('Quotation database unavailable');
    }

    const [counts] = await database.query<{ total: number }>(
      `SELECT count(*)::integer AS total ${QUOTATION_QUERY.JOINS} WHERE q.deleted_at IS NULL AND ${QUOTATION_QUERY.PROJECT_SCOPE}`,
      { type: QueryTypes.SELECT, transaction, bind: { projectId } },
    );
    return counts.total;
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
