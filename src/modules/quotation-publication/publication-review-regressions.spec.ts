import {
  PUBLICATION_KIND,
  PUBLICATION_ROLE,
  PUBLICATION_STATE,
} from './constants/publication.constant';

import {
  testBroker,
  brokerResource,
  spyOnBrokerConnect,
} from './testing/publication-broker.fixture';

import {
  pdf,
  pdfs,
  ROOT,
  event,
  files,
  accept,
  context,
  fixture,
  setRoot,
  orderPdf,
  operations,
  currentCycle,
  createReview,
  completeRole,
  lifecycleEvent,
  startPublicationFixture,
  closePublicationFixture,
} from './testing/publication-integration.fixture';

import { randomUUID } from 'node:crypto';
import type { Transaction } from 'sequelize';
import type { IPublicationCycle } from './interfaces/publication.interface';
import { PublicationExecutorService } from './publication-executor.service';
import { QUOTATION_STATUS } from '@Modules/quotation/constants/quotation.constant';
import { QUOTATION_LIFECYCLE_ACTION } from '@Modules/quotation/constants/quotation-lifecycle.constant';

const EXTERNAL_FAILURE = {
  CREATE: 'create',
  MEDIA: 'media',
  MOVE: 'move',
} as const;
type ExternalFailureType =
  (typeof EXTERNAL_FAILURE)[keyof typeof EXTERNAL_FAILURE];

beforeAll(startPublicationFixture);
afterAll(closePublicationFixture);
beforeEach(async (): Promise<void> => {
  await setRoot(ROOT);
});

describe('publication recovery review regressions on real PostgreSQL', (): void => {
  it('recovers a proposal after verified pin releases bytes and final readback is lost', async (): Promise<void> => {
    const cycle = await createReview();
    await accept(cycle, pdf);
    const { drive, executor, publication } = context();
    drive.retainPublicationRevision.mockImplementationOnce(
      (): Promise<void> => {
        drive.inspectPublicationFile.mockRejectedValueOnce(
          new Error('Lost retained-file readback'),
        );
        return Promise.resolve();
      },
    );
    await executor.execute(cycle.quotationId);
    const [retained] = await operations(cycle);
    expect(retained).toMatchObject({
      pdf: null,
      state: PUBLICATION_STATE.FAILED,
    });
    expect(retained.revisionId).not.toBeNull();
    const file = await currentCycle(cycle);
    expect(pdfs.get(file.fileId ?? '')).toEqual(pdf);
    const creates = drive.createPublicationFile.mock.calls.length;
    await publication.retry(cycle.quotationId, cycle.id, cycle.generation);
    const restarted = new PublicationExecutorService(
      context().repository,
      publication,
      context().destinations,
      context().transactions,
      drive,
    );
    await restarted.execute(cycle.quotationId);
    expect((await currentCycle(cycle)).state).toBe(PUBLICATION_STATE.PUBLISHED);
    expect(drive.createPublicationFile.mock.calls.length).toBe(creates);
    expect((await operations(cycle))[0].hash).toBe(retained.hash);
  });

  it('recovers order move response loss without replacing released media and then archives exact final bytes', async (): Promise<void> => {
    const cycle = await createReview();
    await accept(cycle, pdf);
    const { drive, executor, publication, transactions } = context();
    await executor.execute(cycle.quotationId);
    await transactions.run((transaction): Promise<void> =>
      event(cycle.quotationId, 3, QUOTATION_STATUS.APPROVED, transaction),
    );
    await accept(cycle, orderPdf);
    drive.movePublicationFile.mockImplementationOnce(
      (id, _parents, destination): Promise<void> => {
        const file = files.get(id);
        if (!file) {
          return Promise.reject(new Error('Missing test file'));
        }

        files.set(id, { ...file, parents: [destination] });
        return Promise.reject(new Error('Lost order move response'));
      },
    );
    await executor.execute(cycle.quotationId);
    const retained = (await operations(cycle)).at(-1);
    expect(retained).toMatchObject({
      pdf: null,
      state: PUBLICATION_STATE.FAILED,
    });
    const uncertain = await publication.summary(
      cycle.quotationId,
      fixture.projectId,
      true,
      true,
    );
    expect(uncertain.fileUrl).toBeNull();
    const replaces = drive.replacePublicationMedia.mock.calls.length;
    const current = await currentCycle(cycle);
    await publication.retry(cycle.quotationId, cycle.id, current.generation);
    await executor.execute(cycle.quotationId);
    expect(drive.replacePublicationMedia.mock.calls.length).toBe(replaces);
    const accepted = await publication.summary(
      cycle.quotationId,
      fixture.projectId,
      true,
      true,
    );
    expect(accepted).toMatchObject({
      documentKind: PUBLICATION_KIND.ORDER,
      sourceVersion: 3,
      state: PUBLICATION_STATE.PUBLISHED,
    });
    await transactions.run((transaction): Promise<void> =>
      event(cycle.quotationId, 4, QUOTATION_STATUS.DRAFT, transaction),
    );
    await executor.execute(cycle.quotationId);
    expect((await currentCycle(cycle)).state).toBe(PUBLICATION_STATE.ARCHIVED);
    expect(pdfs.get(current.fileId ?? '')).toEqual(orderPdf);
  });

  it('fences a prepared order when another executor publishes and archives before it resumes', async (): Promise<void> => {
    const cycle = await createReview();
    const { executor, transactions, drive } = context();
    await accept(cycle, pdf);
    await executor.execute(cycle.quotationId);
    await transactions.run((transaction): Promise<void> =>
      event(cycle.quotationId, 3, QUOTATION_STATUS.APPROVED, transaction),
    );
    await accept(cycle, orderPdf);
    const originalRun = <T>(
      work: (transaction: Transaction) => Promise<T>,
    ): Promise<T> => fixture.database().transaction(work);
    const afterArchive = { moves: 0, folderId: '' };
    const interleaving = jest
      .spyOn(transactions, 'run')
      .mockImplementationOnce(
        async <T>(
          work: (transaction: Transaction) => Promise<T>,
        ): Promise<T> => {
          const prepared = await originalRun(work);
          await executor.execute(cycle.quotationId);
          await originalRun((transaction): Promise<void> =>
            event(cycle.quotationId, 4, QUOTATION_STATUS.DRAFT, transaction),
          );
          await executor.execute(cycle.quotationId);
          const archived = await currentCycle(cycle);
          afterArchive.moves = drive.movePublicationFile.mock.calls.length;
          afterArchive.folderId = archived.actualFolderId ?? '';
          return prepared;
        },
      );
    try {
      await executor.execute(cycle.quotationId);
      const archived = await currentCycle(cycle);
      expect(archived.state).toBe(PUBLICATION_STATE.ARCHIVED);
      expect(files.get(archived.fileId ?? '')?.parents).toEqual([
        afterArchive.folderId,
      ]);
      expect(drive.movePublicationFile.mock.calls.length).toBe(
        afterArchive.moves,
      );
    } finally {
      interleaving.mockRestore();
    }
  });

  it.each([
    {
      action: QUOTATION_LIFECYCLE_ACTION.RETURN,
      status: QUOTATION_STATUS.DRAFT,
      failure: EXTERNAL_FAILURE.CREATE,
    },
    {
      action: QUOTATION_LIFECYCLE_ACTION.REJECT,
      status: QUOTATION_STATUS.DRAFT,
      failure: EXTERNAL_FAILURE.MEDIA,
    },
    {
      action: QUOTATION_LIFECYCLE_ACTION.CANCEL,
      status: QUOTATION_STATUS.CANCELLED,
      failure: EXTERNAL_FAILURE.MOVE,
    },
  ])(
    'keeps failed external publication retryable after $action and serializes resubmission',
    async ({ action, status, failure }): Promise<void> => {
      const cycle = await createReview();
      await accept(cycle, pdf);
      const { executor, drive, transactions, publication } = context();
      const needsPublishedProposal = failure !== EXTERNAL_FAILURE.CREATE;
      if (needsPublishedProposal) {
        await executor.execute(cycle.quotationId);
        await transactions.run((transaction): Promise<void> =>
          event(cycle.quotationId, 3, QUOTATION_STATUS.APPROVED, transaction),
        );
        await accept(cycle, orderPdf);
      }

      const injectFailure: Record<ExternalFailureType, () => void> = {
        [EXTERNAL_FAILURE.CREATE]: (): void => {
          drive.createPublicationFile.mockRejectedValueOnce(
            new Error('Create unavailable'),
          );
        },
        [EXTERNAL_FAILURE.MEDIA]: (): void => {
          drive.replacePublicationMedia.mockRejectedValueOnce(
            new Error('Media unavailable'),
          );
        },
        [EXTERNAL_FAILURE.MOVE]: (): void => {
          drive.movePublicationFile.mockRejectedValueOnce(
            new Error('Move unavailable'),
          );
        },
      };
      injectFailure[failure]();
      const withdrawalVersion = needsPublishedProposal ? 4 : 3;
      await executor.execute(cycle.quotationId);
      expect((await currentCycle(cycle)).state).toBe(PUBLICATION_STATE.FAILED);
      await transactions.run((transaction): Promise<void> =>
        lifecycleEvent({
          quotationId: cycle.quotationId,
          version: withdrawalVersion,
          status,
          action,
          transaction,
        }),
      );
      const visible = await publication.summary(
        cycle.quotationId,
        fixture.projectId,
        true,
        true,
      );
      expect(visible.canRetry).toBe(true);
      expect(visible.state).toBe(PUBLICATION_STATE.FAILED);
      await transactions.run((transaction): Promise<void> =>
        event(
          cycle.quotationId,
          withdrawalVersion + 1,
          QUOTATION_STATUS.REVIEW,
          transaction,
        ),
      );
      const fresh = await transactions.run(
        async (transaction): Promise<IPublicationCycle | null> =>
          (
            await context().repository.cycles(cycle.quotationId, transaction)
          ).at(-1) ?? null,
      );
      if (!fresh) {
        throw new Error('Resubmitted cycle missing');
      }

      await accept(fresh, pdf);
      await executor.execute(cycle.quotationId);
      expect((await currentCycle(fresh)).fileId).toBeNull();
      await publication.retry(
        cycle.quotationId,
        visible.cycleId ?? '',
        visible.generation ?? 0,
      );
      await executor.execute(cycle.quotationId);
      await executor.execute(cycle.quotationId);
      await executor.execute(cycle.quotationId);
      expect((await currentCycle(cycle)).state).toBe(
        PUBLICATION_STATE.ARCHIVED,
      );
      expect((await currentCycle(fresh)).state).toBe(
        PUBLICATION_STATE.PUBLISHED,
      );
      expect((await currentCycle(fresh)).fileId).not.toBe(
        (await currentCycle(cycle)).fileId,
      );
    },
  );

  it('retains immutable stage destinations and exposes only the actual accepted stage', async (): Promise<void> => {
    const cycle = await createReview();
    const { executor, transactions, publication } = context();
    await accept(cycle, pdf);
    await executor.execute(cycle.quotationId);
    const original = (await operations(cycle))[0].destinationLabel;
    expect(original).toContain('הצעות מחיר');
    expect(original).toContain(cycle.rootContext.projectLabel);
    await transactions.run((transaction): Promise<void> =>
      event(cycle.quotationId, 3, QUOTATION_STATUS.APPROVED, transaction),
    );
    await transactions.run((transaction): Promise<void> =>
      event(cycle.quotationId, 4, QUOTATION_STATUS.DRAFT, transaction),
    );
    await executor.execute(cycle.quotationId);
    await executor.execute(cycle.quotationId);
    const summary = await publication.summary(
      cycle.quotationId,
      fixture.projectId,
      true,
      true,
    );
    const archived = await currentCycle(cycle);
    const accepted = (await operations(cycle)).find(
      (operation): boolean => operation.hash === archived.actualHash,
    );
    expect(summary.history[0].destinationLabel).toBe(original);
    expect(summary.history[0].fileUrl).toBeNull();
    expect(summary.documentKind).toBe(PUBLICATION_KIND.QUOTATION);
    expect(summary.documentKind).toBe(accepted?.kind);
    expect(summary.sourceVersion).toBe(accepted?.sourceVersion);
  });

  it('archives against the captured old managed root and publishes a fresh linked-root cycle only after explicit completion', async (): Promise<void> => {
    const cycle = await createReview();
    await accept(cycle, pdf);
    const { executor, transactions, publication } = context();
    await executor.execute(cycle.quotationId);
    const oldFile = (await currentCycle(cycle)).fileId;
    const newRoot = `new-root-${randomUUID()}`;
    await setRoot(newRoot, true);
    await transactions.run((transaction): Promise<void> =>
      event(cycle.quotationId, 3, QUOTATION_STATUS.DRAFT, transaction),
    );
    await executor.execute(cycle.quotationId);
    const archived = await currentCycle(cycle);
    expect(archived.state).toBe(PUBLICATION_STATE.ARCHIVED);
    expect(archived.rootId).toBe(ROOT);
    expect(archived.rootContext.linked).toBe(false);
    expect(files.get(archived.actualFolderId ?? '')?.parents).toEqual([ROOT]);
    await transactions.run((transaction): Promise<void> =>
      event(cycle.quotationId, 4, QUOTATION_STATUS.REVIEW, transaction),
    );
    const fresh = await transactions.run(
      async (transaction): Promise<IPublicationCycle | null> =>
        (await context().repository.cycles(cycle.quotationId, transaction)).at(
          -1,
        ) ?? null,
    );
    if (!fresh) {
      throw new Error('Fresh cycle missing');
    }

    await accept(fresh, pdf);
    await executor.execute(cycle.quotationId);
    expect((await currentCycle(fresh)).state).toBe(PUBLICATION_STATE.FAILED);
    expect((await currentCycle(fresh)).fileId).toBeNull();
    completeRole(newRoot, 'הצעות מחיר');
    await publication.retry(cycle.quotationId, fresh.id, fresh.generation);
    await executor.execute(cycle.quotationId);
    expect((await currentCycle(fresh)).rootId).toBe(newRoot);
    expect((await currentCycle(fresh)).fileId).not.toBe(oldFile);
    const mappings = await context().repository.select<{ rootId: string }>(
      `SELECT root_id AS "rootId" FROM quotation_publication_folders WHERE project_id=$projectId AND role=$role`,
      { projectId: fixture.projectId, role: PUBLICATION_ROLE.QUOTATION },
    );
    expect(mappings.map((mapping): string => mapping.rootId)).toEqual(
      expect.arrayContaining([ROOT, newRoot]),
    );
  });

  it('binds an initially missing root with its later linked policy and waits for explicit completion', async (): Promise<void> => {
    await fixture
      .database()
      .query('UPDATE projects SET drive_folder_id=NULL WHERE id=$id', {
        bind: { id: fixture.projectId },
      });
    const cycle = await createReview();
    expect(cycle.rootId).toBeNull();
    await accept(cycle, pdf);
    const { executor, publication, drive } = context();
    await executor.execute(cycle.quotationId);
    expect((await currentCycle(cycle)).state).toBe(PUBLICATION_STATE.FAILED);
    const linkedRoot = `late-linked-${randomUUID()}`;
    await setRoot(linkedRoot, true);
    const writes = drive.createPublicationFile.mock.calls.length;
    await publication.retry(cycle.quotationId, cycle.id, cycle.generation);
    await executor.execute(cycle.quotationId);
    const bound = await currentCycle(cycle);
    expect(bound).toMatchObject({
      rootId: linkedRoot,
      state: PUBLICATION_STATE.FAILED,
    });
    expect(bound.rootContext.linked).toBe(true);
    expect(drive.createPublicationFile.mock.calls.length).toBe(writes);
    completeRole(linkedRoot, 'הצעות מחיר');
    await publication.retry(cycle.quotationId, cycle.id, cycle.generation);
    await executor.execute(cycle.quotationId);
    expect((await currentCycle(cycle)).state).toBe(PUBLICATION_STATE.PUBLISHED);
    expect((await currentCycle(cycle)).rootContext.linked).toBe(true);
  });

  it('keeps a queued accepted snapshot valid when metadata increments the optimistic version', async (): Promise<void> => {
    const cycle = await createReview();
    const [operation] = await operations(cycle);
    await fixture
      .database()
      .query('UPDATE quotations SET version=$version WHERE id=$id', {
        bind: { id: cycle.quotationId, version: operation.sourceVersion + 1 },
      });
    await accept(cycle, pdf);
    await context().executor.execute(cycle.quotationId);
    const [stored] = await operations(cycle);
    expect(stored.sourceVersion).toBe(operation.sourceVersion);
    expect(stored.sourceHash).toBe(operation.sourceHash);
    expect((await currentCycle(cycle)).generation).toBe(cycle.generation);
    expect((await currentCycle(cycle)).state).toBe(PUBLICATION_STATE.PUBLISHED);
  });
});

describe('publication broker setup ownership regressions', (): void => {
  it('rejects invalid configuration before opening any connection across repeated ticks', async (): Promise<void> => {
    const connect = spyOnBrokerConnect();
    const broker = testBroker('invalid / prefix');
    try {
      await broker.tick();
      await broker.tick();
      await broker.tick();
      expect(connect).not.toHaveBeenCalled();
    } finally {
      await broker.beforeApplicationShutdown();
      connect.mockRestore();
    }
  });
  it('closes its exact partial channel and connection after queue declaration fails', async (): Promise<void> => {
    const resource = brokerResource();
    const connect = spyOnBrokerConnect().mockResolvedValue(resource.connection);
    resource.channel.assertQueue.mockRejectedValueOnce(
      new Error('Queue declaration denied'),
    );
    const broker = testBroker(`setup-failure-${randomUUID()}`);
    try {
      await broker.tick();
      expect(resource.channel.close.mock.calls).toHaveLength(1);
      expect(resource.connection.close.mock.calls).toHaveLength(1);
    } finally {
      await broker.beforeApplicationShutdown();
      connect.mockRestore();
    }
  });
  it('does not let a stale close callback discard a newer healthy connection and drains only its current resources', async (): Promise<void> => {
    const old = brokerResource();
    const current = brokerResource();
    const connect = spyOnBrokerConnect()
      .mockResolvedValueOnce(old.connection)
      .mockResolvedValue(current.connection);
    const broker = testBroker(`reconnect-${randomUUID()}`);
    try {
      await broker.tick();
      old.connectionClose();
      await broker.tick();
      old.connectionClose();
      await broker.tick();
      expect(connect).toHaveBeenCalledTimes(2);
      await broker.beforeApplicationShutdown();
      expect(current.channel.close.mock.calls).toHaveLength(1);
      expect(current.connection.close.mock.calls).toHaveLength(1);
    } finally {
      connect.mockRestore();
    }
  });
  it('never adopts a setup connection that closes before queue declaration completes', async (): Promise<void> => {
    const interrupted = brokerResource();
    const current = brokerResource();
    interrupted.channel.assertQueue.mockImplementationOnce(
      (): Promise<{
        queue: string;
        consumerCount: number;
        messageCount: number;
      }> => {
        interrupted.connectionClose();
        return Promise.resolve({
          queue: 'test-queue',
          consumerCount: 0,
          messageCount: 0,
        });
      },
    );
    const connect = spyOnBrokerConnect()
      .mockResolvedValueOnce(interrupted.connection)
      .mockResolvedValue(current.connection);
    const broker = testBroker(`setup-close-${randomUUID()}`);
    try {
      await broker.tick();
      await broker.tick();
      expect(connect).toHaveBeenCalledTimes(2);
      expect(interrupted.channel.close.mock.calls).toHaveLength(1);
      expect(interrupted.connection.close.mock.calls).toHaveLength(1);
    } finally {
      await broker.beforeApplicationShutdown();
      connect.mockRestore();
    }
  });
});
