import {
  Injectable,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

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

import {
  publicationProjectLockKey,
  publicationQuotationLockKey,
} from '@Modules/quotation-publication/utilities/publication-lock.utility';

import { Transaction } from 'sequelize';
import { createHash, randomUUID } from 'node:crypto';
import { PublicationRepository } from './publication.repository';
import { PERMISSIONS, PermissionType } from '@Constants/authorization.constant';
import { QUOTATION_STATUS } from '@Modules/quotation/constants/quotation.constant';
import type { IPublicationRootConfiguration } from './interfaces/publication.interface';
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
      publicationQuotationLockKey(quotationId),
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
    if (!publishes && active) {
      await this.archive(
        active,
        eventId,
        document.version,
        transaction,
        input.permission,
      );
    }
    if (!publishes) {
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
    await this.transactions.lockKey(
      publicationProjectLockKey(document.projectId),
      transaction,
    );
    const [root] = await this.repository.select<IPublicationRootConfiguration>(
      `SELECT p.drive_folder_id AS "rootId",p.drive_folder_linked AS linked,concat(p.code,' — ',p.name) AS "projectLabel",b.drive_folder_id AS "parentRootId",p.parent_project_id AS "parentProjectId" FROM projects p LEFT JOIN projects b ON b.id=p.parent_project_id WHERE p.id=$projectId`,
      { projectId: document.projectId },
      transaction,
    );
    if (!root) {
      throw new ConflictException(PUBLICATION_REASON.MISSING);
    }

    const snapshot = await this.snapshots.capture(document, transaction);
    const serialized = publicationSnapshotJson(snapshot);
    if (Buffer.byteLength(serialized) > PUBLICATION_LIMITS.JOB_BYTES / 2) {
      throw new ConflictException('מסמך גדול מדי להפקת PDF');
    }

    const sourceHash = publicationSnapshotHash(snapshot);
    const previous = active
      ? await this.repository.operations(active.id, transaction)
      : [];
    const blocker = previous.find(
      (operation): boolean =>
        operation.state === PUBLICATION_STATE.FAILED && operation.effectStarted,
    );
    await this.repository.execute(
      `INSERT INTO quotation_publication_cycles(id,quotation_id,project_id,root_id,root_context,generation,desired_kind,source_version,state,reason) VALUES($cycleId,$quotationId,$projectId,$rootId,$rootContext::jsonb,$generation,$kind,$version,$state,$reason) ON CONFLICT(id) DO UPDATE SET generation=EXCLUDED.generation,desired_kind=EXCLUDED.desired_kind,source_version=EXCLUDED.source_version,state=EXCLUDED.state,reason=EXCLUDED.reason,updated_at=now()`,
      {
        cycleId,
        quotationId: document.id,
        projectId: document.projectId,
        rootId: root.rootId,
        rootContext: JSON.stringify({
          linked: root.linked,
          projectLabel: root.projectLabel,
          parentRootId: root.parentRootId,
          parentProjectId: root.parentProjectId,
        }),
        generation,
        kind,
        version: document.version,
        state: blocker ? PUBLICATION_STATE.FAILED : PUBLICATION_STATE.QUEUED,
        reason: blocker?.reason ?? null,
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
    const operations = await this.repository.operations(cycle.id, transaction);
    const blocker = operations.find(
      (operation): boolean =>
        operation.state === PUBLICATION_STATE.FAILED && operation.effectStarted,
    );
    const generation = cycle.generation + 1;
    await this.repository.execute(
      `UPDATE quotation_publication_cycles SET terminal=true,generation=$generation,source_version=$version,state=$state,reason=$reason,updated_at=now() WHERE id=$cycleId`,
      {
        cycleId: cycle.id,
        generation,
        version,
        state: blocker ? PUBLICATION_STATE.FAILED : PUBLICATION_STATE.ARCHIVING,
        reason: blocker?.reason ?? null,
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
    permissions: readonly PermissionType[],
  ): Promise<IPublicationSummary> {
    return this.transactions.readSnapshot(
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
            const uncertain = operations.some(
              (operation): boolean =>
                operation.effectStarted &&
                operation.state !== PUBLICATION_STATE.PUBLISHED &&
                operation.state !== PUBLICATION_STATE.ARCHIVED,
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
              destinationLabel: canReadFiles
                ? operation.destinationLabel
                : null,
              // Only the final stage's current file link is a current-byte claim; earlier retained stages have no misleading live link.
              fileUrl:
                canReadFiles &&
                !uncertain &&
                operation.generation === saved.generation &&
                (operation.kind === null || operation.hash === saved.actualHash)
                  ? this.fileUrl(saved)
                  : null,
              updatedAt: operation.updatedAt,
            }));
          }),
        );
        const acceptedOperations = cycle
          ? await this.repository.operations(cycle.id, transaction)
          : [];
        const acceptedStage =
          acceptedOperations.find(
            (operation): boolean =>
              operation.hash !== null && operation.hash === cycle?.actualHash,
          ) ?? null;
        const uncertain = acceptedOperations.some(
          (operation): boolean =>
            operation.effectStarted &&
            operation.state !== PUBLICATION_STATE.PUBLISHED &&
            operation.state !== PUBLICATION_STATE.ARCHIVED,
        );
        const hasAcceptedStage = !uncertain && acceptedStage !== null;
        const exposesFile = canReadFiles && cycle !== null && hasAcceptedStage;
        const permission = cycle
          ? await this.retryPermission(quotationId, cycle.id, transaction)
          : PERMISSIONS.QUOTATIONS_UPDATE;
        const mayRetry = permissions.includes(permission);
        const currentStage = historyGroups
          .flat()
          .find(
            (entry): boolean =>
              entry.cycleId === cycle?.id &&
              entry.generation === cycle?.generation,
          );
        const untrackedReason = projectId
          ? null
          : PUBLICATION_REASON.NO_PROJECT;
        const reason = cycle ? cycle.reason : untrackedReason;
        return {
          cycleId: cycle?.id ?? null,
          generation: cycle?.generation ?? null,
          documentKind: hasAcceptedStage
            ? acceptedStage.kind
            : (cycle?.desiredKind ?? null),
          sourceVersion: hasAcceptedStage
            ? acceptedStage.sourceVersion
            : (currentStage?.sourceVersion ?? cycle?.sourceVersion ?? null),
          state:
            cycle?.state ??
            (projectId
              ? PUBLICATION_STATE.UNTRACKED
              : PUBLICATION_STATE.NOT_APPLICABLE),
          reason,
          updatedAt: cycle?.updatedAt ?? null,
          destinationLabel: canReadFiles
            ? ((cycle?.state === PUBLICATION_STATE.ARCHIVED
                ? currentStage?.destinationLabel
                : acceptedStage?.destinationLabel) ??
              cycle?.destinationLabel ??
              null)
            : null,
          fileUrl: exposesFile && cycle ? this.fileUrl(cycle) : null,
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
    permissions: readonly PermissionType[],
  ): Promise<void> {
    await this.transactions.run(async (transaction): Promise<void> => {
      await this.lock(quotationId, transaction);
      const cycles = await this.repository.cycles(quotationId, transaction);
      const cycle = cycles.find((saved): boolean => saved.id === cycleId);
      if (cycle?.id !== cycleId || cycle.generation !== generation) {
        throw new ConflictException('מצב פרסום הקובץ השתנה. יש לרענן');
      }

      const permission = await this.retryPermission(
        quotationId,
        cycleId,
        transaction,
      );
      if (!permissions.includes(permission)) {
        throw new ForbiddenException('אין הרשאה לניסיון פרסום נוסף');
      }

      if (cycle.state !== PUBLICATION_STATE.FAILED) {
        return;
      }

      await this.repository.execute(
        `UPDATE quotation_publication_operations SET state=CASE WHEN kind IS NULL THEN 'archiving' WHEN hash IS NULL THEN 'queued' ELSE 'publishing' END,attempt=0,dispatched_at=NULL,reason=NULL,updated_at=now() WHERE cycle_id=$cycleId AND state='failed'`,
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
    cycleId: string,
    transaction?: Transaction,
  ): Promise<PermissionType> {
    const [operation] = await this.repository.select<{
      permission: PermissionType;
    }>(
      `SELECT o.retry_permission AS permission FROM quotation_publication_operations o JOIN quotation_publication_cycles c ON c.id=o.cycle_id WHERE c.quotation_id=$quotationId AND c.id=$cycleId ORDER BY (c.state='failed') DESC,(o.state='failed') DESC,(o.retry_permission='quotations.approve') DESC,c.source_version DESC,o.generation DESC LIMIT 1`,
      { quotationId, cycleId },
      transaction,
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
