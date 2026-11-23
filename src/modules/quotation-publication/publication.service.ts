import {
  PUBLICATION_KIND,
  PUBLICATION_STATE,
  PUBLICATION_REASON,
  PUBLICATION_LIMITS,
} from './constants/publication.constant';

import type {
  IPublicationCycle,
  IPublicationSummary,
  IPublicationHistory,
  IPublicationLifecycle,
} from './interfaces/publication.interface';

import {
  publicationSnapshotJson,
  publicationSnapshotHash,
} from './utilities/publication-hash.utility';

import { Transaction } from 'sequelize';
import { createHash, randomUUID } from 'node:crypto';
import { Injectable, ConflictException } from '@nestjs/common';
import { PublicationRepository } from './publication.repository';
import { PERMISSIONS, PermissionType } from '@Constants/authorization.constant';
import { QUOTATION_STATUS } from '@Modules/quotation/constants/quotation.constant';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import { QuotationPdfSnapshotService } from '@Modules/quotation/quotation-pdf-snapshot.service';

@Injectable()
export class PublicationService {
  constructor(
    private readonly repository: PublicationRepository,
    private readonly snapshots: QuotationPdfSnapshotService,
    private readonly transactions: DatabaseTransactionService,
  ) {}
  async lock(quotationId: string, transaction: Transaction): Promise<void> {
    await this.transactions.lockKey(
      `quotation-publication:${quotationId}`,
      transaction,
    );
  }
  async lifecycle(input: IPublicationLifecycle): Promise<void> {
    const { document, transaction, eventId } = input;
    const cycles = await this.repository.cycles(document.id, transaction);
    const active = cycles.find((cycle): boolean => !cycle.terminal) ?? null;
    const publishes =
      document.status === QUOTATION_STATUS.REVIEW ||
      document.status === QUOTATION_STATUS.APPROVED;
    if (!publishes) {
      if (active) {
        await this.archive(
          active,
          eventId,
          document.version,
          transaction,
          input.permission,
        );
      }
      return;
    }

    if (!document.projectId) {
      return;
    }

    const kind =
      document.status === QUOTATION_STATUS.APPROVED
        ? PUBLICATION_KIND.ORDER
        : PUBLICATION_KIND.QUOTATION;
    const cycleId = active?.id ?? randomUUID();
    const generation = (active?.generation ?? 0) + 1;
    const snapshot = await this.snapshots.capture(document, transaction);
    const serialized = publicationSnapshotJson(snapshot);
    if (Buffer.byteLength(serialized) > PUBLICATION_LIMITS.JOB_BYTES / 2) {
      throw new ConflictException('מסמך גדול מדי להפקת PDF');
    }

    const sourceHash = publicationSnapshotHash(snapshot);
    await this.repository.execute(
      `INSERT INTO quotation_publication_cycles(id,quotation_id,project_id,generation,desired_kind,source_version,state) VALUES($cycleId,$quotationId,$projectId,$generation,$kind,$version,$state) ON CONFLICT(id) DO UPDATE SET generation=EXCLUDED.generation,desired_kind=EXCLUDED.desired_kind,source_version=EXCLUDED.source_version,state=EXCLUDED.state,reason=NULL,updated_at=now()`,
      {
        cycleId,
        quotationId: document.id,
        projectId: document.projectId,
        generation,
        kind,
        version: document.version,
        state: PUBLICATION_STATE.QUEUED,
      },
      transaction,
    );
    await this.repository.execute(
      `INSERT INTO quotation_publication_operations(id,cycle_id,lifecycle_event_id,generation,kind,source_version,retry_permission,source_hash,snapshot,state,job_id) VALUES($id,$cycleId,$eventId,$generation,$kind,$version,$permission,$sourceHash,$snapshot::jsonb,$state,$jobId)`,
      {
        id: randomUUID(),
        cycleId,
        eventId,
        generation,
        kind,
        version: document.version,
        sourceHash,
        snapshot: serialized,
        permission: input.permission,
        state: PUBLICATION_STATE.QUEUED,
        jobId: randomUUID(),
      },
      transaction,
    );
  }
  async archive(
    cycle: IPublicationCycle,
    eventId: string | null,
    version: number,
    transaction: Transaction,
    permission: PermissionType = PERMISSIONS.QUOTATIONS_UPDATE,
  ): Promise<void> {
    const generation = cycle.generation + 1;
    await this.repository.execute(
      `UPDATE quotation_publication_cycles SET terminal=true,generation=$generation,source_version=$version,state=$state,reason=NULL,updated_at=now() WHERE id=$cycleId`,
      {
        cycleId: cycle.id,
        generation,
        version,
        state: PUBLICATION_STATE.ARCHIVING,
      },
      transaction,
    );
    await this.repository.execute(
      `INSERT INTO quotation_publication_operations(id,cycle_id,lifecycle_event_id,generation,source_version,retry_permission,source_hash,state,job_id) VALUES($id,$cycleId,$eventId,$generation,$version,$permission,$sourceHash,$state,$jobId)`,
      {
        id: randomUUID(),
        cycleId: cycle.id,
        permission,
        eventId,
        generation,
        version,
        sourceHash: createHash('sha256')
          .update(`${cycle.id}:${generation}:archive`)
          .digest('hex'),
        state: PUBLICATION_STATE.ARCHIVING,
        jobId: randomUUID(),
      },
      transaction,
    );
  }
  async deleted(quotationId: string, transaction: Transaction): Promise<void> {
    const cycles = await this.repository.cycles(quotationId, transaction);
    const active = cycles.find((cycle): boolean => !cycle.terminal);
    if (active) {
      await this.archive(active, null, active.sourceVersion + 1, transaction);
    }
  }
  async summary(
    quotationId: string,
    projectId: string | null,
    canReadFiles: boolean,
    mayRetry: boolean,
  ): Promise<IPublicationSummary> {
    return this.transactions.run(
      async (transaction): Promise<IPublicationSummary> => {
        const cycles = await this.repository.cycles(quotationId, transaction);
        const cycle =
          cycles.find(
            (saved): boolean => saved.state === PUBLICATION_STATE.FAILED,
          ) ??
          cycles.at(-1) ??
          null;
        const historyGroups = await Promise.all(
          cycles.map(async (saved): Promise<IPublicationHistory[]> => {
            const operations = await this.repository.operations(
              saved.id,
              transaction,
            );
            const accepted = operations.find(
              (operation): boolean =>
                operation.hash !== null && operation.hash === saved.actualHash,
            );
            return operations.map((operation): IPublicationHistory => ({
              lifecycleEventId: operation.lifecycleEventId,
              cycleId: saved.id,
              generation: operation.generation,
              documentKind:
                operation.kind ?? accepted?.kind ?? saved.desiredKind,
              sourceVersion:
                operation.kind === null
                  ? (accepted?.sourceVersion ?? operation.sourceVersion)
                  : operation.sourceVersion,
              state: operation.state,
              reason: operation.reason,
              destinationLabel: canReadFiles ? saved.destinationLabel : null,
              // Only the final stage's current file link is a current-byte claim; earlier retained stages have no misleading live link.
              fileUrl:
                canReadFiles && operation.generation === saved.generation
                  ? this.fileUrl(saved)
                  : null,
              updatedAt: operation.updatedAt,
            }));
          }),
        );
        const currentStage = historyGroups
          .flat()
          .find(
            (entry): boolean =>
              entry.cycleId === cycle?.id &&
              entry.generation === cycle?.generation,
          );
        return {
          cycleId: cycle?.id ?? null,
          generation: cycle?.generation ?? null,
          documentKind: cycle?.desiredKind ?? null,
          sourceVersion:
            currentStage?.sourceVersion ?? cycle?.sourceVersion ?? null,
          state:
            cycle?.state ??
            (projectId
              ? PUBLICATION_STATE.UNTRACKED
              : PUBLICATION_STATE.NOT_APPLICABLE),
          reason:
            cycle?.reason ?? (projectId ? null : PUBLICATION_REASON.NO_PROJECT),
          updatedAt: cycle?.updatedAt ?? null,
          destinationLabel: canReadFiles
            ? (cycle?.destinationLabel ?? null)
            : null,
          fileUrl: canReadFiles && cycle ? this.fileUrl(cycle) : null,
          canRetry: mayRetry && cycle?.state === PUBLICATION_STATE.FAILED,
          history: historyGroups.flat(),
        };
      },
    );
  }
  async retry(
    quotationId: string,
    cycleId: string,
    generation: number,
  ): Promise<void> {
    await this.transactions.run(async (transaction): Promise<void> => {
      await this.lock(quotationId, transaction);
      const cycles = await this.repository.cycles(quotationId, transaction);
      const cycle = cycles.find((saved): boolean => saved.id === cycleId);
      if (cycle?.id !== cycleId || cycle.generation !== generation) {
        throw new ConflictException('מצב פרסום הקובץ השתנה. יש לרענן');
      }

      if (cycle.state !== PUBLICATION_STATE.FAILED) {
        return;
      }

      await this.repository.execute(
        `UPDATE quotation_publication_operations SET state=CASE WHEN kind IS NULL THEN 'archiving' WHEN pdf IS NULL THEN 'queued' ELSE 'publishing' END,attempt=0,dispatched_at=NULL,reason=NULL,updated_at=now() WHERE cycle_id=$cycleId AND state='failed'`,
        { cycleId },
        transaction,
      );
      await this.repository.execute(
        `UPDATE quotation_publication_cycles SET state='queued',reason=NULL,updated_at=now() WHERE id=$cycleId`,
        { cycleId },
        transaction,
      );
    });
  }
  async retryPermission(
    quotationId: string,
    cycleId: string | null = null,
  ): Promise<PermissionType> {
    const [operation] = await this.repository.select<{
      permission: PermissionType;
    }>(
      `SELECT o.retry_permission AS permission FROM quotation_publication_operations o JOIN quotation_publication_cycles c ON c.id=o.cycle_id WHERE c.quotation_id=$quotationId AND ($cycleId::uuid IS NULL OR c.id=$cycleId) ORDER BY (c.state='failed') DESC,c.source_version DESC,o.generation DESC LIMIT 1`,
      { quotationId, cycleId },
    );
    return operation?.permission ?? PERMISSIONS.QUOTATIONS_UPDATE;
  }
  private fileUrl(cycle: IPublicationCycle): string | null {
    const isVerified = cycle.actualHash !== null && cycle.fileId !== null;
    return isVerified
      ? `https://drive.google.com/open?id=${encodeURIComponent(cycle.fileId ?? '')}`
      : null;
  }
}
