import type {
  IEstimatePlan,
  IEstimateRecord,
  IEstimateRevision,
  IEstimateReviewSnapshot,
} from './interfaces/engineering-estimate.interface';

import { Sequelize } from 'sequelize-typescript';
import { Injectable, Inject } from '@nestjs/common';
import { QueryTypes, Transaction } from 'sequelize';
import { ProviderNames } from '@Providers/database/provider-names';

interface IEstimateListing {
  actorId: string;
  canReview: boolean;
  canReadProjects: boolean;
}

interface IStoredPlan extends IEstimatePlan {
  content: Buffer;
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

  async list(filters: IEstimateListing): Promise<IEstimateRecord[]> {
    const rows = await this.sequelize.query<TEstimateRow>(
      `SELECT ${ESTIMATE_FIELDS} FROM engineering_estimates
        WHERE ($canReview OR created_by_id = $actorId)
          AND (project_id IS NULL OR ($canReadProjects AND EXISTS (
            SELECT 1 FROM projects WHERE projects.id=project_id AND projects.deleted_at IS NULL
          )))
        ORDER BY updated_at DESC, id LIMIT 100`,
      { bind: { ...filters }, type: QueryTypes.SELECT },
    );
    return rows.map(hydrate);
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

  plans(id: string, transaction?: Transaction): Promise<IEstimatePlan[]> {
    return this.sequelize.query<IEstimatePlan>(
      `SELECT ${PLAN_FIELDS} FROM engineering_estimate_plans WHERE estimate_id=$id ORDER BY created_at,id`,
      { bind: { id }, transaction, type: QueryTypes.SELECT },
    );
  }

  async getPlan(
    id: string,
    planId: string,
    transaction?: Transaction,
  ): Promise<IStoredPlan | null> {
    const rows = await this.sequelize.query<IStoredPlan>(
      `SELECT ${PLAN_FIELDS}, content FROM engineering_estimate_plans WHERE estimate_id=$id AND id=$planId`,
      { bind: { id, planId }, transaction, type: QueryTypes.SELECT },
    );
    return rows[0] ?? null;
  }

  async addPlan(
    estimateId: string,
    plan: IStoredPlan,
    transaction: Transaction,
  ): Promise<void> {
    await this.sequelize.query(
      `INSERT INTO engineering_estimate_plans (estimate_id,id,name,mime_type,marked,content)
        VALUES ($estimateId,$id,$name,$mimeType,$marked,$content)`,
      { bind: { estimateId, ...plan }, transaction },
    );
  }

  async revision(
    id: string,
    version: number,
    transaction?: Transaction,
  ): Promise<IEstimateRevision | null> {
    const rows = await this.sequelize.query<IEstimateRevision>(
      `SELECT version, CASE WHEN approved_at IS NULL THEN 'sketch' ELSE 'approved' END status,
        snapshot, quotation_id AS "quotationId"
        FROM engineering_estimate_revisions WHERE estimate_id=$id AND version=$version`,
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
