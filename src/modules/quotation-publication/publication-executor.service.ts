import {
  PUBLICATION_KIND,
  PUBLICATION_ROLE,
  PUBLICATION_STATE,
  PUBLICATION_REASON,
} from './constants/publication.constant';

import type {
  IPublicationCycle,
  IPublicationFolder,
  IPublicationOperation,
  IPublicationEffectPlan,
  IPublicationFolderIdentity,
} from './interfaces/publication.interface';

import { Transaction } from 'sequelize';
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PublicationService } from './publication.service';
import { Meta, TypedLogger } from '@Logger/logger.service';
import { GOOGLE_DRIVE } from '@Constants/google-drive.constant';
import { PublicationRepository } from './publication.repository';
import { GoogleDriveService } from '@Providers/google-drive/google-drive.service';
import { PublicationDestinationService } from './publication-destination.service';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import type { IPublicationDriveFile } from '@Providers/google-drive/interfaces/publication-drive.interface';

@Injectable()
export class PublicationExecutorService {
  private readonly logger = new TypedLogger<Meta>(
    PublicationExecutorService.name,
  );
  constructor(
    private readonly repository: PublicationRepository,
    private readonly publication: PublicationService,
    private readonly destinations: PublicationDestinationService,
    private readonly transactions: DatabaseTransactionService,
    private readonly drive: GoogleDriveService,
  ) {}
  stop(): void {
    this.drive.stopPublicationEffects();
  }
  async execute(quotationId: string): Promise<void> {
    const plan = await this.transactions.run(
      async (transaction): Promise<IPublicationEffectPlan | null> => {
        await this.publication.lock(quotationId, transaction);
        const cycles = await this.repository.cycles(quotationId, transaction);
        for (const cycle of cycles) {
          const operations = await this.repository.operations(
            cycle.id,
            transaction,
          );
          const pending = operations.filter(
            (operation): boolean =>
              operation.state !== PUBLICATION_STATE.PUBLISHED &&
              operation.state !== PUBLICATION_STATE.ARCHIVED,
          );
          const next = pending.at(0);
          if (!next) {
            continue;
          }

          const obsolete = next.generation < cycle.generation || cycle.terminal;
          if (obsolete && next.kind !== null && !next.effectStarted) {
            await this.repository.execute(
              `UPDATE quotation_publication_operations SET state='archived',pdf=NULL,reason=$reason,updated_at=now() WHERE id=$id`,
              { id: next.id, reason: PUBLICATION_REASON.SUPERSEDED },
              transaction,
            );
            continue;
          }

          if (next.state === PUBLICATION_STATE.FAILED) {
            await this.fail(
              cycle.id,
              next.id,
              next.reason ?? PUBLICATION_REASON.DRIVE,
              transaction,
            );
            return null;
          }

          if (next.kind !== null && !next.pdf && !next.hash) {
            return null;
          }

          const hasExternalEvidence =
            cycle.actualHash !== null ||
            operations.some(
              (operation): boolean =>
                operation.kind !== null && operation.effectStarted,
            );
          if (next.kind === null && !hasExternalEvidence) {
            await this.repository.execute(
              `UPDATE quotation_publication_operations SET state='archived',reason=$reason,updated_at=now() WHERE id=$id`,
              { id: next.id, reason: PUBLICATION_REASON.SUPERSEDED },
              transaction,
            );
            await this.repository.execute(
              `UPDATE quotation_publication_cycles SET state='archived',reason=$reason,updated_at=now() WHERE id=$id`,
              { id: cycle.id, reason: PUBLICATION_REASON.SUPERSEDED },
              transaction,
            );
            continue;
          }

          const role = next.kind ?? PUBLICATION_ROLE.ARCHIVE;
          try {
            const folder = await this.destinations.prepare(
              cycle,
              role,
              transaction,
            );
            const fileId =
              cycle.fileId ??
              (next.kind === null
                ? null
                : await this.drive.reservePublicationId());
            await this.repository.execute(
              `UPDATE quotation_publication_cycles SET root_id=$rootId,file_id=$fileId,destination_label=$label,state=$state,updated_at=now() WHERE id=$id`,
              {
                id: cycle.id,
                rootId: folder.rootId,
                fileId,
                label: `${cycle.rootContext.projectLabel} / ${folder.label}`,
                state:
                  next.kind === null
                    ? PUBLICATION_STATE.ARCHIVING
                    : PUBLICATION_STATE.PUBLISHING,
              },
              transaction,
            );
            const effectOwner = randomUUID();
            await this.repository.execute(
              `UPDATE quotation_publication_operations SET effect_owner=$effectOwner,effect_started=true,state=$state,updated_at=now() WHERE id=$id`,
              {
                id: next.id,
                effectOwner,
                state: PUBLICATION_STATE.RECONCILING,
              },
              transaction,
            );
            return {
              cycleId: cycle.id,
              effectOwner,
              wasStarted: next.effectStarted,
              operationId: next.id,
              generation: cycle.generation,
              terminal: cycle.terminal,
              folder,
            };
          } catch (error: unknown) {
            await this.fail(
              cycle.id,
              next.id,
              this.safeReason(error),
              transaction,
            );
            return null;
          }
        }
        return null;
      },
    );
    if (!plan) {
      return;
    }

    await this.transactions.run(async (transaction): Promise<void> => {
      await this.publication.lock(quotationId, transaction);
      const cycle = await this.repository.cycle(plan.cycleId, transaction);
      const operation = await this.repository.operation(
        plan.operationId,
        transaction,
      );
      const completed =
        operation?.state === PUBLICATION_STATE.PUBLISHED ||
        operation?.state === PUBLICATION_STATE.ARCHIVED;
      const changed =
        cycle.generation !== plan.generation ||
        cycle.terminal !== plan.terminal;
      const failed = operation?.state === PUBLICATION_STATE.FAILED;
      const desiredRole = operation?.kind ?? PUBLICATION_ROLE.ARCHIVE;
      const matchesDesired = plan.folder.role === desiredRole;
      const invalidGeneration =
        operation !== null && operation.generation > cycle.generation;
      const ownsPlan = operation?.effectOwner === plan.effectOwner;
      if (
        !operation ||
        completed ||
        failed ||
        !ownsPlan ||
        !matchesDesired ||
        invalidGeneration
      ) {
        return;
      }

      if (changed && !plan.wasStarted) {
        await this.repository.execute(
          `UPDATE quotation_publication_operations SET effect_started=false,state='archived',pdf=NULL,reason=$reason,updated_at=now() WHERE id=$id AND effect_owner=$effectOwner`,
          {
            id: operation.id,
            effectOwner: plan.effectOwner,
            reason: PUBLICATION_REASON.SUPERSEDED,
          },
          transaction,
        );
        return;
      }

      if (changed) {
        return;
      }

      const operations = await this.repository.operations(
        cycle.id,
        transaction,
      );
      const blocker = operations.find(
        (saved): boolean =>
          saved.state !== PUBLICATION_STATE.PUBLISHED &&
          saved.state !== PUBLICATION_STATE.ARCHIVED,
      );
      if (blocker?.id !== operation.id) {
        return;
      }

      try {
        await this.destinations.confirm(cycle, plan.folder, transaction);
        await this.apply(cycle, operation, plan.folder, transaction);
      } catch (error: unknown) {
        this.logger.warn({
          message: 'Quotation publication effect requires recovery',
        });
        await this.fail(
          cycle.id,
          operation.id,
          this.safeReason(error),
          transaction,
        );
      }
    });
  }
  private async apply(
    cycle: IPublicationCycle,
    operation: IPublicationOperation,
    folder: IPublicationFolder,
    transaction: Transaction,
  ): Promise<void> {
    if (operation.kind === null) {
      await this.archive(cycle, operation, folder, transaction);
      return;
    }

    if (
      !cycle.fileId ||
      !operation.md5Hash ||
      !operation.hash ||
      !operation.snapshot
    ) {
      throw new Error(PUBLICATION_REASON.DRIVE);
    }

    const expectedMd5 = operation.md5Hash;
    const existing = await this.drive.inspectPublicationFile(cycle.fileId);
    if (existing) {
      this.assertIdentity(existing, cycle);
    }
    if (!existing && (cycle.actualHash || operation.revisionId)) {
      throw new Error(PUBLICATION_REASON.MISSING);
    }

    if (existing) {
      await this.assertPlacement(existing, cycle, transaction);
    }
    if (!existing) {
      // A reserved identity is retried; create cannot overwrite an earlier successful create.
      await this.create(cycle, operation, folder);
    }
    const current = await this.drive.inspectPublicationFile(cycle.fileId);
    if (!current) {
      throw new Error(PUBLICATION_REASON.MISSING);
    }

    this.assertIdentity(current, cycle);
    if (current.md5 !== expectedMd5) {
      await this.replaceOrder(cycle, operation, current, transaction);
    }
    const accepted = await this.drive.inspectPublicationFile(cycle.fileId);
    if (!accepted || accepted.md5 !== expectedMd5) {
      throw new Error(PUBLICATION_REASON.RECONCILING);
    }

    this.assertIdentity(accepted, cycle);
    await this.retainStage(operation, accepted, transaction);
    // The shared quotation lock prevents lifecycle changes while this effect is in flight.
    await this.move(cycle, accepted, folder);
    const final = await this.drive.inspectPublicationFile(cycle.fileId);
    const correctParent =
      final?.parents.length === 1 && final.parents[0] === folder.folderId;
    if (!final || final.md5 !== expectedMd5 || !correctParent) {
      throw new Error(PUBLICATION_REASON.RECONCILING);
    }

    await this.repository.execute(
      `UPDATE quotation_publication_operations SET state='published',destination_label=COALESCE(destination_label,$label),destination_folder_id=COALESCE(destination_folder_id,$folderId),reason=NULL,updated_at=now() WHERE id=$id`,
      {
        id: operation.id,
        label: `${cycle.rootContext.projectLabel} / ${folder.label}`,
        folderId: folder.folderId,
      },
      transaction,
    );
    const isCurrent =
      operation.generation === cycle.generation && !cycle.terminal;
    const pendingState = cycle.terminal
      ? PUBLICATION_STATE.ARCHIVING
      : PUBLICATION_STATE.QUEUED;
    const cycleState = isCurrent ? PUBLICATION_STATE.PUBLISHED : pendingState;
    await this.repository.execute(
      `UPDATE quotation_publication_cycles SET actual_folder_id=$folderId,actual_hash=$hash,state=$state,reason=NULL,updated_at=now() WHERE id=$id`,
      {
        id: cycle.id,
        folderId: folder.folderId,
        hash: operation.hash,
        state: cycleState,
      },
      transaction,
    );
  }
  private async create(
    cycle: IPublicationCycle,
    operation: IPublicationOperation,
    folder: IPublicationFolder,
  ): Promise<void> {
    if (!cycle.fileId || !operation.pdf || !operation.snapshot) {
      throw new Error(PUBLICATION_REASON.DRIVE);
    }

    try {
      await this.drive.createPublicationFile({
        id: cycle.fileId,
        name: operation.snapshot.filename,
        parentId: folder.folderId,
        mimeType: GOOGLE_DRIVE.PDF_MIME_TYPE,
        properties: {
          publicationCycle: cycle.id,
          publicationQuotation: cycle.quotationId,
        },
        bytes: operation.pdf,
      });
    } catch {
      // Reconciliation validates identity, parent, MIME and checksum; a conflict alone is never success.
      this.logger.warn({
        message: 'Publication create response requires verification',
      });
    }
  }
  private async replaceOrder(
    cycle: IPublicationCycle,
    operation: IPublicationOperation,
    current: IPublicationDriveFile,
    transaction: Transaction,
  ): Promise<void> {
    if (
      operation.kind !== PUBLICATION_KIND.ORDER ||
      !operation.pdf ||
      !operation.snapshot
    ) {
      throw new Error(PUBLICATION_REASON.RECONCILING);
    }

    const stages = await this.repository.operations(cycle.id, transaction);
    const proposal = stages.find(
      (stage): boolean =>
        stage.kind === PUBLICATION_KIND.QUOTATION && stage.hash !== null,
    );
    const matchesProposal = proposal?.md5Hash === current.md5;
    if (!proposal || !matchesProposal) {
      throw new Error(PUBLICATION_REASON.RECONCILING);
    }

    await this.retainStage(proposal, current, transaction);
    await this.drive.replacePublicationMedia({
      id: current.id,
      name: operation.snapshot.filename,
      bytes: operation.pdf,
    });
  }
  private async retainStage(
    operation: IPublicationOperation,
    file: IPublicationDriveFile,
    transaction: Transaction,
  ): Promise<void> {
    if (operation.revisionId) {
      return;
    }

    if (!file.revisionId) {
      // Bounded accepted bytes remain durable when a Drive type cannot retain binary revisions.
      return;
    }

    try {
      await this.drive.retainPublicationRevision(
        file.id,
        file.revisionId,
        operation.md5Hash ?? '',
      );
      await this.repository.execute(
        `UPDATE quotation_publication_operations SET revision_id=$revisionId,pdf=NULL WHERE id=$id`,
        { id: operation.id, revisionId: file.revisionId },
        transaction,
      );
    } catch {
      if (!operation.pdf) {
        throw new Error(PUBLICATION_REASON.DRIVE);
      }

      this.logger.warn({
        message:
          'Drive revision retention unavailable; retaining bounded accepted PDF artifact',
      });
    }
  }
  private async archive(
    cycle: IPublicationCycle,
    operation: IPublicationOperation,
    folder: IPublicationFolder,
    transaction: Transaction,
  ): Promise<void> {
    if (!cycle.fileId) {
      throw new Error(PUBLICATION_REASON.MISSING);
    }

    const file = await this.drive.inspectPublicationFile(cycle.fileId);
    if (!file) {
      throw new Error(PUBLICATION_REASON.MISSING);
    }

    this.assertIdentity(file, cycle);
    await this.assertPlacement(file, cycle, transaction);
    const stages = await this.repository.operations(cycle.id, transaction);
    const finalStage = stages
      .filter(
        (stage): boolean =>
          stage.hash !== null && stage.state === PUBLICATION_STATE.PUBLISHED,
      )
      .at(-1);
    if (!finalStage || finalStage.md5Hash !== file.md5) {
      throw new Error(PUBLICATION_REASON.RECONCILING);
    }

    await this.move(cycle, file, folder);
    const actual = await this.drive.inspectPublicationFile(cycle.fileId);
    const sameBytes = actual?.md5 === file.md5;
    const archived =
      actual?.parents.length === 1 && actual.parents[0] === folder.folderId;
    if (!sameBytes || !archived) {
      throw new Error(PUBLICATION_REASON.RECONCILING);
    }

    await this.repository.execute(
      `UPDATE quotation_publication_operations SET state='archived',pdf=NULL,destination_label=COALESCE(destination_label,$label),destination_folder_id=COALESCE(destination_folder_id,$folderId),reason=NULL,updated_at=now() WHERE id=$id`,
      {
        id: operation.id,
        label: `${cycle.rootContext.projectLabel} / ${folder.label}`,
        folderId: folder.folderId,
      },
      transaction,
    );
    await this.repository.execute(
      `UPDATE quotation_publication_cycles SET state='archived',actual_folder_id=$folderId,reason=NULL,updated_at=now() WHERE id=$id`,
      { id: cycle.id, folderId: folder.folderId },
      transaction,
    );
  }
  private async move(
    cycle: IPublicationCycle,
    file: IPublicationDriveFile,
    folder: IPublicationFolder,
  ): Promise<void> {
    if (file.parents.length === 1 && file.parents[0] === folder.folderId) {
      return;
    }

    await this.drive.movePublicationFile(
      file.id,
      file.parents,
      folder.folderId,
    );
  }
  private async assertPlacement(
    file: IPublicationDriveFile,
    cycle: IPublicationCycle,
    transaction: Transaction,
  ): Promise<void> {
    const folders = await this.repository.select<IPublicationFolderIdentity>(
      `SELECT folder_id AS id FROM quotation_publication_folders WHERE project_id=$projectId AND root_id=$rootId AND confirmed`,
      { projectId: cycle.projectId, rootId: cycle.rootId },
      transaction,
    );
    const validParents =
      file.parents.length === 1 &&
      folders.some((folder): boolean => folder.id === file.parents[0]);
    if (!validParents) {
      throw new Error(PUBLICATION_REASON.MISSING);
    }
  }
  private assertIdentity(
    file: IPublicationDriveFile,
    cycle: IPublicationCycle,
  ): void {
    const rightIdentity =
      file.properties.publicationCycle === cycle.id &&
      file.properties.publicationQuotation === cycle.quotationId;
    const validPdf =
      file.mimeType === GOOGLE_DRIVE.PDF_MIME_TYPE && !file.trashed;
    if (!rightIdentity || !validPdf || !file.parents.length) {
      throw new Error(PUBLICATION_REASON.MISSING);
    }
  }
  private safeReason(error: unknown): string {
    const safe = Object.values(PUBLICATION_REASON).find(
      (reason): boolean => error instanceof Error && error.message === reason,
    );
    return safe ?? PUBLICATION_REASON.DRIVE;
  }
  private async fail(
    cycleId: string,
    operationId: string,
    reason: string,
    transaction: Transaction,
  ): Promise<void> {
    await this.repository.execute(
      `UPDATE quotation_publication_operations SET state='failed',reason=$reason,updated_at=now() WHERE id=$operationId`,
      { operationId, reason },
      transaction,
    );
    await this.repository.execute(
      `UPDATE quotation_publication_cycles SET state='failed',reason=$reason,updated_at=now() WHERE id=$cycleId`,
      { cycleId, reason },
      transaction,
    );
  }
}
