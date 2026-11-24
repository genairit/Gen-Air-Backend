import type {
  IQuotationLifecycleEvent,
  IQuotationLifecycleRecord,
} from './interfaces/quotation-lifecycle.interface';

import { Injectable } from '@nestjs/common';
import { Op, QueryTypes, Transaction } from 'sequelize';
import { Quotation } from './entities/quotation.entity';
import { toContainsPattern } from '@Utilities/query.utility';
import { QUOTATION_STATUS } from './constants/quotation.constant';
import type { IQuotation } from './interfaces/quotation.interface';
import { QUOTATION_QUERY } from './constants/quotation-query.constant';
import type { IQuotationCursor } from './interfaces/quotation-cursor.interface';
import { IQuotationCloneCommand } from './interfaces/quotation-clone-command.interface';
import type { IQuotationListFilter } from './interfaces/quotation-list-filter.interface';
import type { IQuotationStatusCounts } from './interfaces/quotation-status-counts.interface';

@Injectable()
export class QuotationRepository {
  async appendLifecycleEvent(
    event: IQuotationLifecycleRecord,
    transaction: Transaction,
  ): Promise<void> {
    const database = Quotation.sequelize;
    if (!database) {
      throw new Error('Quotation database unavailable');
    }
    await database.query(
      'INSERT INTO quotation_lifecycle_events(id,quotation_id,action,from_status,to_status,actor_id,actor_name,occurred_at,quotation_version,reason,evidence) VALUES ($id,$quotationId,$action,$fromStatus,$toStatus,$actorId,$actorName,$occurredAt,$quotationVersion,$reason,$evidence::jsonb)',
      {
        transaction,
        bind: { ...event, evidence: JSON.stringify(event.evidence) },
      },
    );
  }
  async lifecycleHistory(
    quotationId: string,
    transaction: Transaction,
  ): Promise<IQuotationLifecycleEvent[]> {
    const database = Quotation.sequelize;
    if (!database) {
      throw new Error('Quotation database unavailable');
    }
    return database.query<IQuotationLifecycleEvent>(
      'SELECT id,quotation_id AS "quotationId",action,from_status AS "fromStatus",to_status AS "toStatus",actor_id AS "actorId",actor_name AS "actorName",occurred_at::text AS "occurredAt",quotation_version AS "quotationVersion",reason FROM quotation_lifecycle_events WHERE quotation_id=$quotationId ORDER BY quotation_version,id',
      { transaction, bind: { quotationId }, type: QueryTypes.SELECT },
    );
  }
  async findCloneCommand(
    command: Pick<IQuotationCloneCommand, 'actorId' | 'idempotencyKey'>,
    transaction: Transaction,
  ): Promise<Pick<
    IQuotationCloneCommand,
    'payloadHash' | 'quotationId'
  > | null> {
    const database = Quotation.sequelize;
    if (!database) {
      throw new Error('Quotation database unavailable');
    }
    const [saved] = await database.query<
      Pick<IQuotationCloneCommand, 'payloadHash' | 'quotationId'>
    >(
      'SELECT payload_hash AS "payloadHash",quotation_id AS "quotationId" FROM quotation_clone_commands WHERE actor_id=$actorId AND idempotency_key=$idempotencyKey',
      { bind: command, transaction, type: QueryTypes.SELECT },
    );
    return saved ?? null;
  }
  async insertCloneCommand(
    command: IQuotationCloneCommand,
    transaction: Transaction,
  ): Promise<void> {
    const database = Quotation.sequelize;
    if (!database) {
      throw new Error('Quotation database unavailable');
    }
    await database.query(
      'INSERT INTO quotation_clone_commands(actor_id,idempotency_key,payload_hash,quotation_id) VALUES ($actorId,$idempotencyKey,$payloadHash,$quotationId)',
      { bind: { ...command }, transaction },
    );
  }

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
