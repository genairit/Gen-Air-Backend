import {
  PUBLICATION_KIND,
  PUBLICATION_ROLE,
  PUBLICATION_STATE,
  PUBLICATION_LIMITS,
  PUBLICATION_POLICY,
  PUBLICATION_REASON,
  PUBLICATION_RESULT_STATUS,
} from './constants/publication.constant';

import type {
  IPublicationCycle,
  IPublicationOperation,
} from './interfaces/publication.interface';

import {
  pdf,
  pdfs,
  ROOT,
  event,
  files,
  until,
  accept,
  context,
  fixture,
  setRoot,
  deferred,
  orderPdf,
  completeRole,
  currentCycle,
  createReview,
  lifecycleEvent,
  startPublicationFixture,
  closePublicationFixture,
} from './testing/publication-integration.fixture';

import { connect } from 'amqplib';
import { mock } from 'jest-mock-extended';
import { ConfigService } from '@nestjs/config';
import { randomUUID, createHash } from 'node:crypto';
import { GOOGLE_DRIVE } from '@Constants/google-drive.constant';
import { PublicationBrokerService } from './publication-broker.service';
import { PublicationExecutorService } from './publication-executor.service';
import { publicationSnapshotHash } from './utilities/publication-hash.utility';
import { QUOTATION_STATUS } from '@Modules/quotation/constants/quotation.constant';

beforeAll(startPublicationFixture);
afterAll(closePublicationFixture);

describe('durable quotation publication on real PostgreSQL', (): void => {
  it('reapplies the migration additively and binds actual template identities', async (): Promise<void> => {
    const roles = await context().repository.select<{
      role: string;
      name: string;
    }>(
      `SELECT r.role,t.name FROM quotation_publication_roles r JOIN drive_template_folders t ON t.id=r.template_id`,
      {},
    );
    expect(roles).toHaveLength(3);
    expect(roles).toContainEqual({
      role: PUBLICATION_ROLE.ORDER,
      name: 'הזמנה לביצוע',
    });
  });
  it('rolls back lifecycle and publication together and hashes JSONB round trips canonically', async (): Promise<void> => {
    const cycle = await createReview();
    await expect(
      context().transactions.run(async (transaction): Promise<void> => {
        await event(
          cycle.quotationId,
          3,
          QUOTATION_STATUS.APPROVED,
          transaction,
        );
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    const operations = await context().transactions.run(
      async (transaction): Promise<IPublicationOperation[]> =>
        context().repository.operations(cycle.id, transaction),
    );
    expect(operations).toHaveLength(1);
    expect(operations[0].sourceHash).toBe(
      publicationSnapshotHash(operations[0].snapshot ?? {}),
    );
    await expect(
      context().transactions.run(async (transaction): Promise<void> => {
        await context().repository.execute(
          `UPDATE quotation_publication_operations SET snapshot='{}' WHERE id=$id`,
          { id: operations[0].id },
          transaction,
        );
      }),
    ).rejects.toThrow('immutable');
  });
  it('reconciles lost create, retains exact stages, replaces same ID and archives final bytes before a new cycle', async (): Promise<void> => {
    const cycle = await createReview();
    await accept(cycle, pdf);
    await context().executor.execute(cycle.quotationId);
    const review = await currentCycle(cycle);
    expect(review.state).toBe(PUBLICATION_STATE.PUBLISHED);
    expect(review.fileId).not.toBeNull();
    expect(pdfs.get(review.fileId ?? '')).toEqual(pdf);
    await context().transactions.run(async (transaction): Promise<void> => {
      await event(cycle.quotationId, 3, QUOTATION_STATUS.APPROVED, transaction);
    });
    await accept(cycle, orderPdf);
    await context().executor.execute(cycle.quotationId);
    const order = await currentCycle(cycle);
    expect(order.fileId).toBe(review.fileId);
    expect(pdfs.get(order.fileId ?? '')).toEqual(orderPdf);
    expect(
      context().drive.retainPublicationRevision.mock.calls.length,
    ).toBeGreaterThan(0);
    await context().transactions.run(async (transaction): Promise<void> => {
      await event(cycle.quotationId, 4, QUOTATION_STATUS.DRAFT, transaction);
    });
    await context().executor.execute(cycle.quotationId);
    expect((await currentCycle(cycle)).state).toBe(PUBLICATION_STATE.ARCHIVED);
    const archivedSummary = await context().publication.summary(
      cycle.quotationId,
      fixture.projectId,
      true,
      true,
    );
    expect(archivedSummary.history.at(-1)).toMatchObject({
      documentKind: PUBLICATION_KIND.ORDER,
      sourceVersion: 3,
      state: PUBLICATION_STATE.ARCHIVED,
    });
    expect(archivedSummary.sourceVersion).toBe(3);
    expect(archivedSummary.history[0].destinationLabel).toContain('הצעות מחיר');
    expect(archivedSummary.history[1].destinationLabel).toContain(
      'הזמנה לביצוע',
    );
    expect(archivedSummary.history[2].destinationLabel).toContain(
      'ארכיון הצעות מחיר',
    );
    expect(archivedSummary.history[0].destinationLabel).toContain(
      cycle.rootContext.projectLabel,
    );
    expect(pdfs.get(order.fileId ?? '')).toEqual(orderPdf);
    await context().transactions.run(async (transaction): Promise<void> => {
      await event(cycle.quotationId, 5, QUOTATION_STATUS.REVIEW, transaction);
    });
    const fresh = await context().transactions.run(
      async (transaction): Promise<IPublicationCycle> =>
        (await context().repository.cycles(cycle.quotationId, transaction)).at(
          -1,
        ) ?? cycle,
    );
    await accept(fresh, pdf);
    await context().executor.execute(cycle.quotationId);
    expect((await currentCycle(fresh)).fileId).not.toBe(order.fileId);
    expect(pdfs.get(order.fileId ?? '')).toEqual(orderPdf);
  });
  it('supersedes unused rendering on withdrawal without creating a file', async (): Promise<void> => {
    const cycle = await createReview();
    const count = files.size;
    await context().transactions.run(async (transaction): Promise<void> => {
      await event(cycle.quotationId, 3, QUOTATION_STATUS.DRAFT, transaction);
    });
    await context().executor.execute(cycle.quotationId);
    await context().executor.execute(cycle.quotationId);
    expect((await currentCycle(cycle)).state).toBe(PUBLICATION_STATE.ARCHIVED);
    expect(files.size).toBe(count);
    const summary = await context().publication.summary(
      cycle.quotationId,
      fixture.projectId,
      true,
      true,
    );
    expect(summary).toMatchObject({
      state: PUBLICATION_STATE.ARCHIVED,
      reason: PUBLICATION_REASON.SUPERSEDED,
      fileUrl: null,
    });
  });
  it('blocks linked-folder completion and resumes the same failed cycle without inventing a destination', async (): Promise<void> => {
    await setRoot(ROOT, true);
    const cycle = await createReview();
    await fixture
      .database()
      .query(
        `DELETE FROM quotation_publication_folders WHERE project_id=$projectId AND root_id=$rootId AND role=$role`,
        {
          bind: {
            projectId: fixture.projectId,
            rootId: ROOT,
            role: PUBLICATION_ROLE.QUOTATION,
          },
        },
      );
    const quotationFolder = [...files.values()].find(
      (file): boolean => file.name === 'הצעות מחיר',
    );
    if (quotationFolder) {
      files.delete(quotationFolder.id);
    }
    await accept(cycle, pdf);
    await context().executor.execute(cycle.quotationId);
    expect((await currentCycle(cycle)).state).toBe(PUBLICATION_STATE.FAILED);
    expect((await currentCycle(cycle)).fileId).toBeNull();
    completeRole(ROOT, 'הצעות מחיר');
    await context().publication.retry(
      cycle.quotationId,
      cycle.id,
      cycle.generation,
    );
    await context().executor.execute(cycle.quotationId);
    expect((await currentCycle(cycle)).state).toBe(PUBLICATION_STATE.PUBLISHED);
    await setRoot(ROOT);
  });
  it('serializes lifecycle and effects with the shared database lock across independent transactions', async (): Promise<void> => {
    const cycle = await createReview();
    const acquired = deferred();
    const release = deferred();
    const pending = context().transactions.run(
      async (transaction): Promise<void> => {
        await context().publication.lock(cycle.quotationId, transaction);
        acquired.resolve();
        await release.promise;
      },
    );
    await acquired.promise;
    const other = context().transactions.run(
      async (transaction): Promise<boolean> => {
        const [row] = await context().repository.select<{ locked: boolean }>(
          `SELECT pg_try_advisory_xact_lock(hashtextextended($key,0)) AS locked`,
          { key: `quotation-publication:${cycle.quotationId}` },
          transaction,
        );
        return row.locked;
      },
    );
    expect(await other).toBe(false);
    release.resolve();
    await pending;
  });
  it('serializes two quotations provisioning the same required role folder', async (): Promise<void> => {
    const first = await createReview();
    const second = await createReview();
    await accept(first, pdf);
    await accept(second, pdf);
    await Promise.all([
      context().executor.execute(first.quotationId),
      context().executor.execute(second.quotationId),
    ]);
    const folders = await context().repository.select<{ count: number }>(
      `SELECT count(*)::integer AS count FROM quotation_publication_folders WHERE project_id=$projectId AND role='quotation'`,
      { projectId: fixture.projectId },
    );
    expect(folders[0].count).toBe(1);
    expect((await currentCycle(first)).fileId).not.toBe(
      (await currentCycle(second)).fileId,
    );
  });
  it('retains bounded exact bytes when pinning is denied and never recreates a missing accepted identity', async (): Promise<void> => {
    const cycle = await createReview();
    await accept(cycle, pdf);
    context().drive.retainPublicationRevision.mockRejectedValueOnce(
      new Error('unsupported retention'),
    );
    await context().executor.execute(cycle.quotationId);
    const saved = await currentCycle(cycle);
    const stages = await context().transactions.run(
      async (transaction): Promise<IPublicationOperation[]> =>
        context().repository.operations(cycle.id, transaction),
    );
    expect(stages[0].pdf).toEqual(pdf);
    expect(stages[0].revisionId).toBeNull();
    const acceptedFile = files.get(saved.fileId ?? '');
    files.delete(saved.fileId ?? '');
    await context().transactions.run(async (transaction): Promise<void> => {
      await event(cycle.quotationId, 3, QUOTATION_STATUS.APPROVED, transaction);
    });
    await accept(cycle, orderPdf);
    const writes = context().drive.createPublicationFile.mock.calls.length;
    await context().executor.execute(cycle.quotationId);
    expect((await currentCycle(cycle)).state).toBe(PUBLICATION_STATE.FAILED);
    expect(context().drive.createPublicationFile.mock.calls.length).toBe(
      writes,
    );
    if (acceptedFile) {
      files.set(acceptedFile.id, acceptedFile);
    }
  });
  it('preserves the original canonical project when a withdrawn quotation later changes projects', async (): Promise<void> => {
    const cycle = await createReview();
    await accept(cycle, pdf);
    await context().executor.execute(cycle.quotationId);
    const otherProject = randomUUID();
    await fixture
      .database()
      .query(
        `INSERT INTO projects(id,customer_id,name,code,drive_folder_id) VALUES($id,$customerId,'Other','P-2','foreign-root')`,
        { bind: { id: otherProject, customerId: fixture.customerId } },
      );
    await context().transactions.run((transaction): Promise<void> =>
      lifecycleEvent({
        quotationId: cycle.quotationId,
        version: 3,
        status: QUOTATION_STATUS.DRAFT,
        projectId: otherProject,
        transaction,
      }),
    );
    await context().executor.execute(cycle.quotationId);
    const archived = await currentCycle(cycle);
    expect(archived.projectId).toBe(fixture.projectId);
    expect(archived.rootId).toBe(ROOT);
    expect(archived.state).toBe(PUBLICATION_STATE.ARCHIVED);
    const summary = await context().publication.summary(
      cycle.quotationId,
      otherProject,
      true,
      true,
    );
    expect(summary.destinationLabel).toContain(cycle.rootContext.projectLabel);
    expect(summary.destinationLabel).not.toContain('P-2');
  });
  it('surfaces a failed old archive in the compact retry contract before allowing a new cycle to publish', async (): Promise<void> => {
    const cycle = await createReview();
    await accept(cycle, pdf);
    await context().executor.execute(cycle.quotationId);
    await context().transactions.run(async (transaction): Promise<void> => {
      await event(cycle.quotationId, 3, QUOTATION_STATUS.DRAFT, transaction);
    });
    context().drive.movePublicationFile.mockRejectedValueOnce(
      new Error('Archive unavailable'),
    );
    await context().executor.execute(cycle.quotationId);
    expect((await currentCycle(cycle)).state).toBe(PUBLICATION_STATE.FAILED);
    await context().transactions.run(async (transaction): Promise<void> => {
      await event(cycle.quotationId, 4, QUOTATION_STATUS.REVIEW, transaction);
    });
    const fresh = await context().transactions.run(
      async (transaction): Promise<IPublicationCycle> =>
        (await context().repository.cycles(cycle.quotationId, transaction)).at(
          -1,
        ) ?? cycle,
    );
    await accept(fresh, pdf);
    await context().executor.execute(cycle.quotationId);
    expect((await currentCycle(fresh)).fileId).toBeNull();
    const visible = await context().publication.summary(
      cycle.quotationId,
      fixture.projectId,
      true,
      true,
    );
    expect(visible).toMatchObject({
      cycleId: cycle.id,
      generation: 2,
      state: PUBLICATION_STATE.FAILED,
      canRetry: true,
    });
    await expect(
      context().publication.retry(cycle.quotationId, cycle.id, 1),
    ).rejects.toThrow('רענן');
    await context().publication.retry(cycle.quotationId, cycle.id, 2);
    await context().executor.execute(cycle.quotationId);
    expect((await currentCycle(cycle)).state).toBe(PUBLICATION_STATE.ARCHIVED);
    await context().executor.execute(cycle.quotationId);
    expect((await currentCycle(fresh)).state).toBe(PUBLICATION_STATE.PUBLISHED);
  });
  it('adopts a real Rabbit result durably before ACK and ignores a later different duplicate', async (): Promise<void> => {
    const prefix = `publication.test.${randomUUID()}`;
    const url = 'amqp://quotation_test:quotation_test@127.0.0.1:5678';
    const config = new ConfigService({
      RABBITMQ_URL: url,
      WORKER_QUEUE_PREFIX: prefix,
    });
    const broker = new PublicationBrokerService(
      config,
      context().publication,
      context().repository,
      mock<PublicationExecutorService>(),
      context().transactions,
    );
    const connection = await connect(url);
    const channel = await connection.createConfirmChannel();
    try {
      const cycle = await createReview();
      await broker.tick();
      const operation = await context().transactions.run(
        async (transaction): Promise<IPublicationOperation> =>
          (await context().repository.operations(cycle.id, transaction))[0],
      );
      const envelope = {
        version: 1,
        tenantId: PUBLICATION_POLICY.TENANT,
        jobType: PUBLICATION_POLICY.RENDERER,
        jobId: operation.jobId,
        status: PUBLICATION_RESULT_STATUS.SUCCEEDED,
        correlation: {
          cycleId: cycle.id,
          operationId: operation.id,
          generation: operation.generation,
          sourceHash: operation.sourceHash,
        },
        output: {
          pdfBase64: pdf.toString('base64'),
          byteLength: pdf.length,
          sha256: createHash('sha256').update(pdf).digest('hex'),
          contentType: GOOGLE_DRIVE.PDF_MIME_TYPE,
          cycleId: cycle.id,
          operationId: operation.id,
          generation: operation.generation,
          sourceHash: operation.sourceHash,
        },
      };
      const poisoned = {
        ...envelope,
        jobId: 'not-uuid',
        correlation: {
          ...envelope.correlation,
          operationId: 'not-uuid',
          cycleId: 'not-uuid',
        },
      };
      const foreignOperationId = randomUUID();
      const foreign = {
        ...envelope,
        jobId: randomUUID(),
        correlation: {
          ...envelope.correlation,
          operationId: foreignOperationId,
        },
        output: { ...envelope.output, operationId: foreignOperationId },
      };
      const staleGeneration = envelope.correlation.generation + 1;
      const stale = {
        ...envelope,
        correlation: { ...envelope.correlation, generation: staleGeneration },
        output: { ...envelope.output, generation: staleGeneration },
      };
      const malformedFailure = {
        ...poisoned,
        status: PUBLICATION_RESULT_STATUS.FAILED,
        output: null,
      };
      const staleFailure = {
        ...stale,
        status: PUBLICATION_RESULT_STATUS.FAILED,
        output: null,
      };
      const invalidHash = {
        ...envelope,
        output: { ...envelope.output, sha256: '0'.repeat(64) },
      };
      for (const invalid of [
        poisoned,
        foreign,
        stale,
        invalidHash,
        malformedFailure,
        staleFailure,
      ]) {
        channel.sendToQueue(
          `${prefix}.pdf.results`,
          Buffer.from(JSON.stringify(invalid)),
          { persistent: true },
        );
      }
      channel.sendToQueue(
        `${prefix}.pdf.results`,
        Buffer.alloc(PUBLICATION_LIMITS.RESULT_BYTES + 1),
        { persistent: true },
      );
      channel.sendToQueue(
        `${prefix}.pdf.results`,
        Buffer.from(JSON.stringify(envelope)),
        { persistent: true },
      );
      await channel.waitForConfirms();
      await until(async (): Promise<boolean> =>
        context().transactions.run(
          async (transaction): Promise<boolean> =>
            (await context().repository.operation(operation.id, transaction))
              ?.hash === envelope.output.sha256,
        ),
      );
      await context().executor.execute(cycle.quotationId);
      const retained = await context().transactions.run(
        async (transaction): Promise<IPublicationOperation | null> =>
          context().repository.operation(operation.id, transaction),
      );
      expect(retained?.pdf).toBeNull();
      expect(retained?.revisionId).not.toBeNull();
      channel.sendToQueue(
        `${prefix}.pdf.results`,
        Buffer.from(
          JSON.stringify({
            ...envelope,
            output: {
              ...envelope.output,
              pdfBase64: orderPdf.toString('base64'),
              byteLength: orderPdf.length,
              sha256: createHash('sha256').update(orderPdf).digest('hex'),
            },
          }),
        ),
        { persistent: true },
      );
      await channel.waitForConfirms();
      await until(
        async (): Promise<boolean> =>
          (await channel.checkQueue(`${prefix}.pdf.results`)).messageCount ===
          0,
      );
      const adopted = await context().transactions.run(
        async (transaction): Promise<IPublicationOperation | null> =>
          context().repository.operation(operation.id, transaction),
      );
      expect(adopted?.pdf).toBeNull();
      expect(adopted?.revisionId).not.toBeNull();
      expect(adopted?.hash).toBe(envelope.output.sha256);
    } finally {
      await broker.beforeApplicationShutdown();
      await channel.deleteQueue(`${prefix}.pdf.jobs`);
      await channel.deleteQueue(`${prefix}.pdf.results`);
      await channel.close();
      await connection.close();
    }
  });
});
