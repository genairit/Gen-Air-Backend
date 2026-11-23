import type {
  IPublicationCycle,
  IPublicationFolder,
  IPublicationOperation,
} from './interfaces/publication.interface';

import { Sequelize } from 'sequelize-typescript';
import { Inject, Injectable } from '@nestjs/common';
import { QueryTypes, Transaction } from 'sequelize';
import { ProviderNames } from '@Providers/database/provider-names';

const CYCLE_COLUMNS = `id,quotation_id AS "quotationId",project_id AS "projectId",root_id AS "rootId",file_id AS "fileId",root_context AS "rootContext",terminal,generation,desired_kind AS "desiredKind",source_version AS "sourceVersion",state,reason,updated_at::text AS "updatedAt",destination_label AS "destinationLabel",actual_folder_id AS "actualFolderId",actual_hash AS "actualHash"`;
const OPERATION_COLUMNS = `id,cycle_id AS "cycleId",lifecycle_event_id AS "lifecycleEventId",generation,kind,source_version AS "sourceVersion",source_hash AS "sourceHash",snapshot,state,job_id AS "jobId",attempt,pdf,hash,md5_hash AS "md5Hash",revision_id AS "revisionId",effect_started AS "effectStarted",destination_label AS "destinationLabel",destination_folder_id AS "destinationFolderId",dispatched_at AS "dispatchedAt",reason,updated_at::text AS "updatedAt"`;
const FOLDER_COLUMNS = `project_id AS "projectId",role,root_id AS "rootId",folder_id AS "folderId",label,confirmed`;

@Injectable()
export class PublicationRepository {
  constructor(
    @Inject(ProviderNames.SEQUELIZE) private readonly database: Sequelize,
  ) {}
  async execute(
    sql: string,
    bind: Record<string, unknown>,
    transaction: Transaction,
  ): Promise<void> {
    await this.database.query(sql, { bind, transaction });
  }
  select<T extends object>(
    sql: string,
    bind: Record<string, unknown>,
    transaction?: Transaction,
  ): Promise<T[]> {
    return this.database.query<T>(sql, {
      bind,
      transaction,
      type: QueryTypes.SELECT,
    });
  }
  cycles(
    quotationId: string,
    transaction: Transaction,
  ): Promise<IPublicationCycle[]> {
    return this.select<IPublicationCycle>(
      `SELECT ${CYCLE_COLUMNS} FROM quotation_publication_cycles WHERE quotation_id=$quotationId ORDER BY source_version,id`,
      { quotationId },
      transaction,
    );
  }
  async cycle(
    id: string,
    transaction: Transaction,
  ): Promise<IPublicationCycle> {
    const [cycle] = await this.select<IPublicationCycle>(
      `SELECT ${CYCLE_COLUMNS} FROM quotation_publication_cycles WHERE id=$id`,
      { id },
      transaction,
    );
    if (!cycle) {
      throw new Error('Publication cycle not found');
    }

    return cycle;
  }
  operations(
    cycleId: string,
    transaction: Transaction,
  ): Promise<IPublicationOperation[]> {
    return this.select<IPublicationOperation>(
      `SELECT ${OPERATION_COLUMNS} FROM quotation_publication_operations WHERE cycle_id=$cycleId ORDER BY generation`,
      { cycleId },
      transaction,
    );
  }
  async operation(
    id: string,
    transaction: Transaction,
  ): Promise<IPublicationOperation | null> {
    const [operation] = await this.select<IPublicationOperation>(
      `SELECT ${OPERATION_COLUMNS} FROM quotation_publication_operations WHERE id=$id`,
      { id },
      transaction,
    );
    return operation ?? null;
  }
  async folder(
    projectId: string,
    rootId: string,
    role: string,
    transaction: Transaction,
  ): Promise<IPublicationFolder | null> {
    const [folder] = await this.select<IPublicationFolder>(
      `SELECT ${FOLDER_COLUMNS} FROM quotation_publication_folders WHERE project_id=$projectId AND root_id=$rootId AND role=$role`,
      { projectId, rootId, role },
      transaction,
    );
    return folder ?? null;
  }
  async pending(): Promise<string[]> {
    const rows = await this.select<{ quotationId: string }>(
      `SELECT DISTINCT c.quotation_id AS "quotationId" FROM quotation_publication_cycles c JOIN quotation_publication_operations o ON o.cycle_id=c.id WHERE o.state NOT IN ('published','archived','failed') ORDER BY c.quotation_id LIMIT 20`,
      {},
    );
    return rows.map((row): string => row.quotationId);
  }
}
