import {
  decodeCursor,
  toCursorPage,
} from '@Utilities/cursor-pagination.utility';

import type {
  IEstimatePlan,
  IEstimateRecord,
  IEstimateSummary,
  IEstimateRevision,
  IStoredEstimatePlan,
  IEstimateReviewSnapshot,
} from './interfaces/engineering-estimate.interface';

import { Sequelize } from 'sequelize-typescript';
import { Injectable, Inject } from '@nestjs/common';
import { QueryTypes, Transaction } from 'sequelize';
import { ProviderNames } from '@Providers/database/provider-names';
import type { ICursorPage } from '@Interfaces/cursor-page.interface';

interface IEstimateListing {
  actorId: string;
  batchSize: number;
  canReview: boolean;
  canReadProjects: boolean;
  batchCursor: string | null;
}

const ESTIMATE_FIELDS = `id, name, project_id AS "projectId", created_by_id AS "createdById",
  version, updated_at AS "updatedAt", contents`;
const PLAN_FIELDS = `id, name, marked, mime_type AS "mimeType"`;

type TEstimateRow = Pick<
  IEstimateRecord,
  'id' | 'name' | 'projectId' | 'createdById' | 'version' | 'updatedAt'
> & {
  contents: Pick<
    IEstimateRecord,
    'scope' | 'setupStep' | 'areas' | 'questions'
  >;
};

const hydrate = ({ contents, ...row }: TEstimateRow): IEstimateRecord => ({
  ...row,
  ...contents,
});

@Injectable()
export class EngineeringEstimateRepository {
  constructor(
    @Inject(ProviderNames.SEQUELIZE) private readonly sequelize: Sequelize,
  ) {}

  async list(
    filters: IEstimateListing,
  ): Promise<ICursorPage<IEstimateSummary>> {
    const position = decodeCursor(filters.batchCursor);
    const { batchSize, actorId, canReview, canReadProjects } = filters;
    type TSummaryRow = IEstimateSummary & { createdAt: Date };
    const rows = await this.sequelize.query<TSummaryRow>(
      `SELECT e.id, e.name, e.project_id AS "projectId", e.updated_at AS "updatedAt",
        e.updated_at AS "createdAt",
        CASE WHEN r.approved_at IS NOT NULL THEN 'approved'
             WHEN r.version IS NOT NULL THEN 'sketch' ELSE 'draft' END status
        FROM engineering_estimates e
        LEFT JOIN engineering_estimate_revisions r ON r.estimate_id=e.id AND r.version=e.version
        WHERE ($canReview OR e.created_by_id = $actorId)
          AND (e.project_id IS NULL OR ($canReadProjects AND EXISTS (
            SELECT 1 FROM projects p WHERE p.id=e.project_id AND p.deleted_at IS NULL
          )))
          AND ($positionDate::timestamptz IS NULL OR (e.updated_at, e.id) < ($positionDate::timestamptz, $positionId::uuid))
        ORDER BY e.updated_at DESC, e.id DESC LIMIT $limit`,
      {
        bind: {
          actorId,
          canReview,
          canReadProjects,
          limit: batchSize + 1,
          positionDate: position?.createdAt ?? null,
          positionId: position?.id ?? null,
        },
        type: QueryTypes.SELECT,
      },
    );
    const page = toCursorPage(rows, batchSize);
    return {
      nextCursor: page.nextCursor,
      items: page.items.map(({ createdAt, ...item }): IEstimateSummary => {
        void createdAt;
        return item;
      }),
    };
  }

  async find(
    id: string,
    transaction?: Transaction,
  ): Promise<IEstimateRecord | null> {
    const rows = await this.sequelize.query<TEstimateRow>(
      `SELECT ${ESTIMATE_FIELDS} FROM engineering_estimates WHERE id = $id`,
      { bind: { id }, transaction, type: QueryTypes.SELECT },
    );
    const row = rows[0];
    return row ? hydrate(row) : null;
  }

  async insert(
    record: IEstimateRecord,
    transaction: Transaction,
  ): Promise<void> {
    const {
      id,
      name,
      createdById,
      projectId,
      version,
      updatedAt,
      ...contents
    } = record;
    await this.sequelize.query(
      `INSERT INTO engineering_estimates (id,name,created_by_id,project_id,version,updated_at,contents)
        VALUES ($id,$name,$createdById,$projectId,$version,$updatedAt,$contents::jsonb)`,
      {
        bind: {
          id,
          name,
          createdById,
          projectId,
          version,
          updatedAt,
          contents: JSON.stringify(contents),
        },
        transaction,
      },
    );
  }

  async update(
    record: IEstimateRecord,
    transaction: Transaction,
  ): Promise<void> {
    const {
      id,
      name,
      projectId,
      createdById,
      version,
      updatedAt,
      ...contents
    } = record;
    void createdById;
    await this.sequelize.query(
      `UPDATE engineering_estimates SET name=$name, project_id=$projectId,
        version=$version, updated_at=$updatedAt, contents=$contents::jsonb WHERE id=$id`,
      {
        bind: {
          id,
          name,
          projectId,
          version,
          updatedAt,
          contents: JSON.stringify(contents),
        },
        transaction,
      },
    );
  }

  plans(
    id: string,
    transaction?: Transaction,
    allowCopied = true,
  ): Promise<IEstimatePlan[]> {
    return this.sequelize.query<IEstimatePlan>(
      `SELECT ${PLAN_FIELDS} FROM engineering_estimate_plans WHERE estimate_id=$id AND ($allowCopied OR source_project_id IS NULL) ORDER BY created_at,id`,
      { bind: { id, allowCopied }, transaction, type: QueryTypes.SELECT },
    );
  }

  async getPlan(
    id: string,
    planId: string,
    transaction?: Transaction,
  ): Promise<IStoredEstimatePlan | null> {
    const rows = await this.sequelize.query<IStoredEstimatePlan>(
      `SELECT ${PLAN_FIELDS}, content,
        CASE WHEN source_project_id IS NULL THEN NULL
             ELSE jsonb_build_object('projectId',source_project_id,'fileId',source_drive_file_id)
        END source FROM engineering_estimate_plans WHERE estimate_id=$id AND id=$planId`,
      { bind: { id, planId }, transaction, type: QueryTypes.SELECT },
    );
    return rows[0] ?? null;
  }

  async hasCopiedPlans(id: string, transaction: Transaction): Promise<boolean> {
    const rows = await this.sequelize.query<{ found: boolean }>(
      'SELECT EXISTS(SELECT 1 FROM engineering_estimate_plans WHERE estimate_id=$id AND source_project_id IS NOT NULL) found',
      { bind: { id }, transaction, type: QueryTypes.SELECT },
    );
    return rows[0]?.found ?? false;
  }

  async addPlan(
    estimateId: string,
    plan: IStoredEstimatePlan,
    transaction: Transaction,
  ): Promise<void> {
    const { source, ...file } = plan;
    await this.sequelize.query(
      `INSERT INTO engineering_estimate_plans (estimate_id,id,name,mime_type,marked,content,source_project_id,source_drive_file_id)
        VALUES ($estimateId,$id,$name,$mimeType,$marked,$content,$projectId,$fileId)`,
      {
        bind: {
          estimateId,
          ...file,
          projectId: source?.projectId ?? null,
          fileId: source?.fileId ?? null,
        },
        transaction,
      },
    );
  }

  async revision(
    id: string,
    version: number,
    transaction?: Transaction,
  ): Promise<IEstimateRevision | null> {
    const rows = await this.sequelize.query<IEstimateRevision>(
      `SELECT r.version, CASE WHEN r.approved_at IS NULL THEN 'sketch' ELSE 'approved' END status,
        r.snapshot, r.quotation_id AS "quotationId",
        (r.quotation_id IS NOT NULL AND q.id IS NULL) AS "quotationUnavailable"
        FROM engineering_estimate_revisions r
        LEFT JOIN quotations q ON q.id=r.quotation_id AND q.deleted_at IS NULL
        WHERE r.estimate_id=$id AND r.version=$version`,
      { bind: { id, version }, transaction, type: QueryTypes.SELECT },
    );
    return rows[0] ?? null;
  }

  async addSketch(
    id: string,
    version: number,
    snapshot: IEstimateReviewSnapshot,
    pdf: Buffer,
    transaction: Transaction,
  ): Promise<void> {
    await this.sequelize.query(
      `INSERT INTO engineering_estimate_revisions (estimate_id,version,snapshot,sketch_pdf)
        VALUES ($id,$version,$snapshot::jsonb,$pdf) ON CONFLICT (estimate_id,version) DO NOTHING`,
      {
        bind: { id, version, snapshot: JSON.stringify(snapshot), pdf },
        transaction,
      },
    );
  }

  async getSketch(
    id: string,
    version: number,
    transaction?: Transaction,
  ): Promise<Buffer | null> {
    const rows = await this.sequelize.query<{ pdf: Buffer }>(
      'SELECT sketch_pdf AS pdf FROM engineering_estimate_revisions WHERE estimate_id=$id AND version=$version',
      { bind: { id, version }, transaction, type: QueryTypes.SELECT },
    );
    return rows[0]?.pdf ?? null;
  }

  async approve(
    id: string,
    version: number,
    actorId: string,
    transaction: Transaction,
  ): Promise<void> {
    await this.sequelize.query(
      `UPDATE engineering_estimate_revisions SET approved_at=now(), approved_by_id=$actorId
        WHERE estimate_id=$id AND version=$version AND approved_at IS NULL`,
      { bind: { id, version, actorId }, transaction },
    );
  }

  async linkQuotation(
    id: string,
    version: number,
    quotationId: string,
    transaction: Transaction,
  ): Promise<void> {
    await this.sequelize.query(
      `UPDATE engineering_estimate_revisions SET quotation_id=$quotationId
        WHERE estimate_id=$id AND version=$version AND approved_at IS NOT NULL AND quotation_id IS NULL`,
      { bind: { id, version, quotationId }, transaction },
    );
  }
}
