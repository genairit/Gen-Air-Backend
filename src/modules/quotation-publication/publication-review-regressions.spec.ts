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
  consumeJobId,
  deliverResult,
  latestOperation,
  drainReadyResults,
} from './testing/publication-result.fixture';

import {
  completionService,
  interruptCompletionAfterRoleCreate,
} from './testing/publication-completion.fixture';

import type {
  ICommittedRoleReservation,
  IConfirmedRoleReservation,
} from './testing/publication-completion.fixture';

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

import {
  rootWriter,
  runTransaction,
  resetRootClaims,
  insertRootProject,
} from './testing/publication-root-writer.fixture';

import { connect } from 'amqplib';
import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { mock } from 'jest-mock-extended';
import type { Transaction } from 'sequelize';
import type { ConfirmChannel } from 'amqplib';
import { ConfigService } from '@nestjs/config';
import { BadGatewayException } from '@nestjs/common';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { PublicationBrokerService } from './publication-broker.service';
import { DRIVE_TEMPLATE_TAGS } from '@Constants/drive-template.constant';
import { deferred, until } from './testing/publication-integration.fixture';
import type { IPublicationCycle } from './interfaces/publication.interface';
import { PublicationExecutorService } from './publication-executor.service';
import type { IPublicationFolder } from './interfaces/publication.interface';
import { QUOTATION_STATUS } from '@Modules/quotation/constants/quotation.constant';
import { publicationPhysicalRootLockKey } from './utilities/publication-lock.utility';
import { PUBLICATION_TEST_PERMISSIONS } from './testing/publication-integration.fixture';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import { APARTMENTS_FOLDER_NAME } from '@Modules/project-drive/constants/project-drive.constant';
import { QUOTATION_LIFECYCLE_ACTION } from '@Modules/quotation/constants/quotation-lifecycle.constant';

const COMPLETION_ACTION = {
  AUTOMATIC: 'automatic',
  EXPLICIT: 'complete-template',
} as const;

const APPROVAL_PHASE = {
  BEFORE_RENDER: 'before-render',
  AFTER_ACCEPT: 'accepted-before-create',
  BETWEEN_EFFECTS: 'between-prepare-effect',
} as const;
const PREFLIGHT_FOLLOWUP = {
  APPROVE: 'approve',
  RETURN: 'return',
  DELETE: 'delete',
} as const;

const WITHDRAWAL_ACTION = { WITHDRAW: 'withdraw', DELETE: 'delete' } as const;

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
  await resetRootClaims();
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
    await publication.retry(
      cycle.quotationId,
      cycle.id,
      cycle.generation,
      PUBLICATION_TEST_PERMISSIONS,
    );
    expect((await operations(cycle))[0].state).toBe(
      PUBLICATION_STATE.PUBLISHING,
    );
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
      PUBLICATION_TEST_PERMISSIONS,
    );
    expect(uncertain.fileUrl).toBeNull();
    const replaces = drive.replacePublicationMedia.mock.calls.length;
    const current = await currentCycle(cycle);
    await publication.retry(
      cycle.quotationId,
      cycle.id,
      current.generation,
      PUBLICATION_TEST_PERMISSIONS,
    );
    expect((await operations(cycle)).at(-1)?.state).toBe(
      PUBLICATION_STATE.PUBLISHING,
    );
    await executor.execute(cycle.quotationId);
    expect(drive.replacePublicationMedia.mock.calls.length).toBe(replaces);
    const accepted = await publication.summary(
      cycle.quotationId,
      fixture.projectId,
      true,
      PUBLICATION_TEST_PERMISSIONS,
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
        PUBLICATION_TEST_PERMISSIONS,
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
        PUBLICATION_TEST_PERMISSIONS,
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
      PUBLICATION_TEST_PERMISSIONS,
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
    await publication.retry(
      cycle.quotationId,
      fresh.id,
      fresh.generation,
      PUBLICATION_TEST_PERMISSIONS,
    );
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
    await publication.retry(
      cycle.quotationId,
      cycle.id,
      cycle.generation,
      PUBLICATION_TEST_PERMISSIONS,
    );
    await executor.execute(cycle.quotationId);
    const bound = await currentCycle(cycle);
    expect(bound).toMatchObject({
      rootId: linkedRoot,
      state: PUBLICATION_STATE.FAILED,
    });
    expect(bound.rootContext.linked).toBe(true);
    expect(drive.createPublicationFile.mock.calls.length).toBe(writes);
    completeRole(linkedRoot, 'הצעות מחיר');
    await publication.retry(
      cycle.quotationId,
      cycle.id,
      cycle.generation,
      PUBLICATION_TEST_PERMISSIONS,
    );
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
      (): ReturnType<ConfirmChannel['assertQueue']> => {
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

describe('physical root, lineage and desired-stage review regressions', (): void => {
  it('revalidates foreign ownership after an actual project root claim between prepare and effect', async (): Promise<void> => {
    const cycle = await createReview();
    await accept(cycle, pdf);
    const otherProject = randomUUID();
    await insertRootProject(otherProject);
    const writer = rootWriter();
    const away = completeRole('company-root', 'Relinked root');
    const { transactions, executor, drive } = context();
    const creates = drive.createPublicationFile.mock.calls.length;
    const interleaving = jest
      .spyOn(transactions, 'run')
      .mockImplementationOnce(
        async <T>(
          work: (transaction: Transaction) => Promise<T>,
        ): Promise<T> => {
          const prepared = await runTransaction(work);
          await writer.setDriveFolderId(fixture.projectId, away);
          await writer.setDriveFolderId(otherProject, ROOT);
          return prepared;
        },
      );
    try {
      await executor.execute(cycle.quotationId);
      expect(drive.createPublicationFile.mock.calls).toHaveLength(creates);
      expect((await currentCycle(cycle)).state).toBe(PUBLICATION_STATE.FAILED);
      expect(pdfs.has((await currentCycle(cycle)).fileId ?? '')).toBe(false);
    } finally {
      interleaving.mockRestore();
    }
  });

  it('holds the physical root through effects so a normal claim writer waits until the effect commits', async (): Promise<void> => {
    const cycle = await createReview();
    await accept(cycle, pdf);
    const otherProject = randomUUID();
    await insertRootProject(otherProject);
    const writer = rootWriter();
    await writer.setDriveFolderId(
      fixture.projectId,
      completeRole('company-root', 'New canonical root'),
    );
    const { transactions, executor, drive } = context();
    const originalCreate =
      drive.createPublicationFile.getMockImplementation() ?? null;
    if (!originalCreate) {
      throw new Error('Drive fixture implementation missing');
    }

    const release = deferred();
    const state = {
      entered: false,
      claiming: false,
      attempted: false,
      claimed: false,
    };
    const unobservedTransactions = new DatabaseTransactionService(
      fixture.database(),
    );
    const lock = jest
      .spyOn(transactions, 'lockKey')
      .mockImplementation(async (key, transaction): Promise<void> => {
        if (state.claiming && key === publicationPhysicalRootLockKey(ROOT)) {
          state.attempted = true;
        }

        await unobservedTransactions.lockKey(key, transaction);
      });
    drive.createPublicationFile.mockImplementation(
      async (input): Promise<void> => {
        if (input.bytes !== null && !state.entered) {
          state.entered = true;
          await release.promise;
        }

        await originalCreate(input);
      },
    );
    const effect = executor.execute(cycle.quotationId);
    try {
      await until((): Promise<boolean> => Promise.resolve(state.entered));
      state.claiming = true;
      const claim = writer
        .setDriveFolderId(otherProject, ROOT)
        .then((): void => {
          state.claimed = true;
        });
      await until((): Promise<boolean> => Promise.resolve(state.attempted));
      expect(state.claimed).toBe(false);
      release.resolve();
      await effect;
      await claim;
      expect(state.claimed).toBe(true);
      expect((await currentCycle(cycle)).state).toBe(
        PUBLICATION_STATE.PUBLISHED,
      );
    } finally {
      release.resolve();
      await effect;
      drive.createPublicationFile.mockImplementation(originalCreate);
      lock.mockRestore();
    }
  });

  it('fills only missing original apartment lineage after authorized provision and preserves all frozen source authority', async (): Promise<void> => {
    const building = randomUUID();
    const otherBuilding = randomUUID();
    await insertRootProject(building);
    await insertRootProject(otherBuilding);
    const buildingRoot = completeRole('company-root', 'Original building');
    const wrongBuildingRoot = completeRole('company-root', 'Other building');
    const apartments = completeRole(buildingRoot, APARTMENTS_FOLDER_NAME);
    const wrongApartments = completeRole(
      wrongBuildingRoot,
      APARTMENTS_FOLDER_NAME,
    );
    await fixture
      .database()
      .query('UPDATE projects SET parent_project_id=$parent WHERE id=$id', {
        bind: { id: fixture.projectId, parent: building },
      });
    const root = files.get(ROOT);
    if (!root) {
      throw new Error('Apartment root missing');
    }

    files.set(ROOT, { ...root, parents: [apartments] });
    const cycle = await createReview();
    expect(cycle.rootContext.parentRootId).toBeNull();
    expect(cycle.rootContext.parentProjectId).toBe(building);
    await accept(cycle, pdf);
    const [original] = await operations(cycle);
    const { publication, executor } = context();
    await executor.execute(cycle.quotationId);
    expect((await currentCycle(cycle)).state).toBe(PUBLICATION_STATE.FAILED);
    await rootWriter().setDriveFolderId(building, buildingRoot);
    await fixture
      .database()
      .query(
        'UPDATE projects SET parent_project_id=$parent,drive_folder_linked=true WHERE id=$id',
        { bind: { id: fixture.projectId, parent: otherBuilding } },
      );
    files.set(ROOT, { ...root, parents: [wrongApartments] });
    await publication.retry(
      cycle.quotationId,
      cycle.id,
      cycle.generation,
      PUBLICATION_TEST_PERMISSIONS,
    );
    await executor.execute(cycle.quotationId);
    expect((await currentCycle(cycle)).state).toBe(PUBLICATION_STATE.FAILED);
    expect((await currentCycle(cycle)).rootContext.parentRootId).toBeNull();
    files.set(ROOT, { ...root, parents: [apartments] });
    await publication.retry(
      cycle.quotationId,
      cycle.id,
      cycle.generation,
      PUBLICATION_TEST_PERMISSIONS,
    );
    await executor.execute(cycle.quotationId);
    const repaired = await currentCycle(cycle);
    expect(repaired.state).toBe(PUBLICATION_STATE.PUBLISHED);
    expect(repaired.rootId).toBe(ROOT);
    expect(repaired.rootContext).toEqual({
      ...cycle.rootContext,
      parentRootId: buildingRoot,
    });
    const [preserved] = await operations(cycle);
    expect(preserved.snapshot).toEqual(original.snapshot);
    expect(preserved.sourceHash).toBe(original.sourceHash);
    expect(preserved.hash).toBe(original.hash);
    await expect(
      context().transactions.run((transaction): Promise<void> =>
        context().repository.execute(
          `UPDATE quotation_publication_cycles SET root_context=jsonb_set(root_context,'{parentRootId}',to_jsonb($root::text)) WHERE id=$id`,
          { id: cycle.id, root: wrongBuildingRoot },
          transaction,
        ),
      ),
    ).rejects.toThrow('immutable');
    await expect(
      context().transactions.run((transaction): Promise<void> =>
        context().repository.execute(
          `UPDATE quotation_publication_cycles SET root_context=jsonb_set(root_context,'{linked}','true'::jsonb) WHERE id=$id`,
          { id: cycle.id },
          transaction,
        ),
      ),
    ).rejects.toThrow('immutable');
  });

  it('uses the same selected failed cycle permission for summary visibility and guarded retry', async (): Promise<void> => {
    const cycle = await createReview();
    await accept(cycle, pdf);
    const { executor, publication, transactions, drive, repository } =
      context();
    await executor.execute(cycle.quotationId);
    await transactions.run((transaction): Promise<void> =>
      lifecycleEvent({
        quotationId: cycle.quotationId,
        version: 3,
        status: QUOTATION_STATUS.DRAFT,
        permission: PERMISSIONS.QUOTATIONS_UPDATE,
        transaction,
      }),
    );
    drive.movePublicationFile.mockRejectedValueOnce(
      new Error('Archive unavailable'),
    );
    await executor.execute(cycle.quotationId);
    await transactions.run((transaction): Promise<void> =>
      lifecycleEvent({
        quotationId: cycle.quotationId,
        version: 4,
        status: QUOTATION_STATUS.REVIEW,
        permission: PERMISSIONS.QUOTATIONS_APPROVE,
        transaction,
      }),
    );
    await transactions.run((transaction): Promise<void> =>
      lifecycleEvent({
        quotationId: cycle.quotationId,
        version: 5,
        status: QUOTATION_STATUS.APPROVED,
        permission: PERMISSIONS.QUOTATIONS_APPROVE,
        transaction,
      }),
    );
    const fresh = await transactions.run(
      async (transaction): Promise<IPublicationCycle | null> =>
        (await repository.cycles(cycle.quotationId, transaction)).at(-1) ??
        null,
    );
    if (!fresh) {
      throw new Error('Later failed cycle missing');
    }

    await transactions.run(async (transaction): Promise<void> => {
      await repository.execute(
        `UPDATE quotation_publication_cycles SET state=$state WHERE id=$id`,
        { id: fresh.id, state: PUBLICATION_STATE.FAILED },
        transaction,
      );
      await repository.execute(
        `UPDATE quotation_publication_operations SET state=$state WHERE cycle_id=$id AND kind=$kind`,
        {
          id: fresh.id,
          kind: PUBLICATION_KIND.ORDER,
          state: PUBLICATION_STATE.FAILED,
        },
        transaction,
      );
    });
    const update = [PERMISSIONS.QUOTATIONS_UPDATE];
    const approve = [PERMISSIONS.QUOTATIONS_APPROVE];
    const visibleUpdate = await publication.summary(
      cycle.quotationId,
      fixture.projectId,
      true,
      update,
    );
    const visibleApprove = await publication.summary(
      cycle.quotationId,
      fixture.projectId,
      true,
      approve,
    );
    expect(visibleUpdate).toMatchObject({ cycleId: cycle.id, canRetry: true });
    expect(visibleApprove).toMatchObject({
      cycleId: cycle.id,
      canRetry: false,
    });
    await expect(
      publication.retry(
        cycle.quotationId,
        cycle.id,
        visibleUpdate.generation ?? 0,
        approve,
      ),
    ).rejects.toThrow();
    await expect(
      publication.retry(
        cycle.quotationId,
        cycle.id,
        (visibleUpdate.generation ?? 0) + 1,
        update,
      ),
    ).rejects.toThrow('לרענן');
    await publication.retry(
      cycle.quotationId,
      cycle.id,
      visibleUpdate.generation ?? 0,
      update,
    );
    expect(
      await publication.summary(
        cycle.quotationId,
        fixture.projectId,
        true,
        approve,
      ),
    ).toMatchObject({ cycleId: fresh.id, canRetry: true });
    expect(
      await publication.summary(
        cycle.quotationId,
        fixture.projectId,
        true,
        update,
      ),
    ).toMatchObject({ cycleId: fresh.id, canRetry: false });
    await expect(
      publication.retry(cycle.quotationId, fresh.id, fresh.generation, update),
    ).rejects.toThrow();
    await publication.retry(
      cycle.quotationId,
      fresh.id,
      fresh.generation,
      approve,
    );
  });

  it.each(Object.values(APPROVAL_PHASE))(
    'waits for order-owned bytes without a new obsolete proposal create at %s',
    async (phase): Promise<void> => {
      const cycle = await createReview();
      const { executor, transactions, drive } = context();
      const creates = drive.createPublicationFile.mock.calls.filter(
        ([input]): boolean => input.bytes !== null,
      ).length;
      const state = { reserved: cycle.fileId };
      if (phase !== APPROVAL_PHASE.BEFORE_RENDER) {
        await accept(cycle, pdf);
      }

      const interleaving =
        phase === APPROVAL_PHASE.BETWEEN_EFFECTS
          ? jest
              .spyOn(transactions, 'run')
              .mockImplementationOnce(
                async <T>(
                  work: (transaction: Transaction) => Promise<T>,
                ): Promise<T> => {
                  const plan = await runTransaction(work);
                  state.reserved = (await currentCycle(cycle)).fileId;
                  await runTransaction((transaction): Promise<void> =>
                    event(
                      cycle.quotationId,
                      3,
                      QUOTATION_STATUS.APPROVED,
                      transaction,
                    ),
                  );
                  return plan;
                },
              )
          : null;
      try {
        if (interleaving) {
          await executor.execute(cycle.quotationId);
        }
        if (!interleaving) {
          await transactions.run((transaction): Promise<void> =>
            event(cycle.quotationId, 3, QUOTATION_STATUS.APPROVED, transaction),
          );
        }

        await executor.execute(cycle.quotationId);
        expect(
          drive.createPublicationFile.mock.calls.filter(
            ([input]): boolean => input.bytes !== null,
          ),
        ).toHaveLength(creates);
        expect((await operations(cycle)).at(-1)?.state).not.toBe(
          PUBLICATION_STATE.PUBLISHED,
        );
        await accept(cycle, orderPdf);
        await executor.execute(cycle.quotationId);
        const saved = await currentCycle(cycle);
        expect(saved.state).toBe(PUBLICATION_STATE.PUBLISHED);
        expect(pdfs.get(saved.fileId ?? '')).toEqual(orderPdf);
        if (state.reserved) {
          expect(saved.fileId).toBe(state.reserved);
        }

        expect(files.get(saved.actualFolderId ?? '')?.name).toBe(
          'הזמנה לביצוע',
        );
      } finally {
        interleaving?.mockRestore();
      }
    },
  );

  it.each(Object.values(WITHDRAWAL_ACTION))(
    'creates no obsolete proposal when %s occurs after prepare and before effects',
    async (action): Promise<void> => {
      const cycle = await createReview();
      await accept(cycle, pdf);
      const { executor, transactions, publication, drive } = context();
      const creates = drive.createPublicationFile.mock.calls.filter(
        ([input]): boolean => input.bytes !== null,
      ).length;
      const interleaving = jest
        .spyOn(transactions, 'run')
        .mockImplementationOnce(
          async <T>(
            work: (transaction: Transaction) => Promise<T>,
          ): Promise<T> => {
            const plan = await runTransaction(work);
            await runTransaction(async (transaction): Promise<void> => {
              if (action === WITHDRAWAL_ACTION.DELETE) {
                await publication.deleted(cycle.quotationId, transaction);
                await context().repository.execute(
                  'UPDATE quotations SET deleted_at=now() WHERE id=$id',
                  { id: cycle.quotationId },
                  transaction,
                );
                return;
              }

              await event(
                cycle.quotationId,
                3,
                QUOTATION_STATUS.DRAFT,
                transaction,
              );
            });
            return plan;
          },
        );
      try {
        await executor.execute(cycle.quotationId);
        await executor.execute(cycle.quotationId);
        expect(
          drive.createPublicationFile.mock.calls.filter(
            ([input]): boolean => input.bytes !== null,
          ),
        ).toHaveLength(creates);
        expect((await currentCycle(cycle)).state).toBe(
          PUBLICATION_STATE.ARCHIVED,
        );
      } finally {
        interleaving.mockRestore();
      }
    },
  );

  it('reconciles an uncertain reserved proposal only in its original quotation destination before waiting for order bytes', async (): Promise<void> => {
    const cycle = await createReview();
    await accept(cycle, pdf);
    const { executor, transactions, publication, drive } = context();
    drive.createPublicationFile.mockRejectedValueOnce(
      new Error('Uncertain create response'),
    );
    await executor.execute(cycle.quotationId);
    const uncertain = await currentCycle(cycle);
    expect((await latestOperation(cycle)).effectStarted).toBe(true);
    expect(uncertain.fileId).not.toBeNull();
    await transactions.run((transaction): Promise<void> =>
      event(cycle.quotationId, 3, QUOTATION_STATUS.APPROVED, transaction),
    );
    const visible = await publication.summary(
      cycle.quotationId,
      fixture.projectId,
      true,
      PUBLICATION_TEST_PERMISSIONS,
    );
    expect(visible.state).toBe(PUBLICATION_STATE.FAILED);
    expect(visible.canRetry).toBe(true);
    await publication.retry(
      cycle.quotationId,
      cycle.id,
      visible.generation ?? 0,
      PUBLICATION_TEST_PERMISSIONS,
    );
    const restarted = new PublicationExecutorService(
      context().repository,
      publication,
      context().destinations,
      transactions,
      drive,
    );
    await restarted.execute(cycle.quotationId);
    const reconciled = await currentCycle(cycle);
    expect(reconciled.fileId).toBe(uncertain.fileId);
    expect(reconciled.state).not.toBe(PUBLICATION_STATE.PUBLISHED);
    expect(pdfs.get(reconciled.fileId ?? '')).toEqual(pdf);
    expect(files.get(reconciled.actualFolderId ?? '')?.name).toBe('הצעות מחיר');
    expect((await operations(cycle)).at(-1)?.state).not.toBe(
      PUBLICATION_STATE.PUBLISHED,
    );
    await accept(cycle, orderPdf);
    await executor.execute(cycle.quotationId);
    expect((await currentCycle(cycle)).fileId).toBe(uncertain.fileId);
    expect(pdfs.get(uncertain.fileId ?? '')).toEqual(orderPdf);
  });
});

describe('first-owner provenance and render-attempt recovery regressions', (): void => {
  it.each(Object.values(PREFLIGHT_FOLLOWUP))(
    'keeps a read-only first-owner preflight failure unused through %s',
    async (action): Promise<void> => {
      const cycle = await createReview();
      await accept(cycle, pdf);
      const {
        executor,
        destinations,
        transactions,
        publication,
        drive,
        repository,
      } = context();
      const writes = drive.createPublicationFile.mock.calls.length;
      const preflight = jest
        .spyOn(destinations, 'confirm')
        .mockRejectedValueOnce(new Error('Read-only root preflight denied'));
      try {
        await executor.execute(cycle.quotationId);
      } finally {
        preflight.mockRestore();
      }
      const failed = await latestOperation(cycle);
      expect(failed.state).toBe(PUBLICATION_STATE.FAILED);
      expect(failed.effectStarted).toBe(false);
      expect(drive.createPublicationFile.mock.calls).toHaveLength(writes);
      await transactions.run(async (transaction): Promise<void> => {
        if (action === PREFLIGHT_FOLLOWUP.DELETE) {
          await publication.lock(cycle.quotationId, transaction);
          await publication.deleted(cycle.quotationId, transaction);
          await repository.execute(
            'UPDATE quotations SET deleted_at=now() WHERE id=$id',
            { id: cycle.quotationId },
            transaction,
          );
          return;
        }

        const status =
          action === PREFLIGHT_FOLLOWUP.APPROVE
            ? QUOTATION_STATUS.APPROVED
            : QUOTATION_STATUS.DRAFT;
        await event(cycle.quotationId, 3, status, transaction);
      });
      await executor.execute(cycle.quotationId);
      await executor.execute(cycle.quotationId);
      expect(drive.createPublicationFile.mock.calls).toHaveLength(writes);
      if (action === PREFLIGHT_FOLLOWUP.APPROVE) {
        expect((await latestOperation(cycle)).state).not.toBe(
          PUBLICATION_STATE.PUBLISHED,
        );
        await accept(cycle, orderPdf);
        await executor.execute(cycle.quotationId);
        const published = await currentCycle(cycle);
        expect(pdfs.get(published.fileId ?? '')).toEqual(orderPdf);
        expect(files.get(published.actualFolderId ?? '')?.name).toBe(
          'הזמנה לביצוע',
        );
        return;
      }

      expect((await currentCycle(cycle)).state).toBe(
        PUBLICATION_STATE.ARCHIVED,
      );
    },
  );

  it('rotates only a fresh render job identity and rejects delayed prior outcomes before adopting current bytes', async (): Promise<void> => {
    const cycle = await createReview();
    const { executor, publication, transactions, repository, drive } =
      context();
    await accept(cycle, pdf);
    await executor.execute(cycle.quotationId);
    const originalFileId = (await currentCycle(cycle)).fileId;
    await transactions.run((transaction): Promise<void> =>
      event(cycle.quotationId, 3, QUOTATION_STATUS.APPROVED, transaction),
    );
    const prefix = `publication.retry.${randomUUID()}`;
    const url = 'amqp://quotation_test:quotation_test@127.0.0.1:5678';
    const pending = jest
      .spyOn(repository, 'pending')
      .mockResolvedValue([cycle.quotationId]);
    const broker = new PublicationBrokerService(
      new ConfigService({ RABBITMQ_URL: url, WORKER_QUEUE_PREFIX: prefix }),
      publication,
      repository,
      mock<PublicationExecutorService>(),
      transactions,
    );
    const connection = await connect(url);
    const channel = await connection.createConfirmChannel();
    try {
      await broker.tick();
      const old = await latestOperation(cycle);
      expect(await consumeJobId(channel, prefix)).toBe(old.jobId);
      await deliverResult({ channel, prefix, operation: old, bytes: null });
      await until(
        async (): Promise<boolean> =>
          (await latestOperation(cycle)).state === PUBLICATION_STATE.FAILED,
      );
      const currentCycleBeforeRetry = await currentCycle(cycle);
      await publication.retry(
        cycle.quotationId,
        cycle.id,
        currentCycleBeforeRetry.generation,
        PUBLICATION_TEST_PERMISSIONS,
      );
      const fresh = await latestOperation(cycle);
      expect(fresh.jobId).not.toBe(old.jobId);
      expect(fresh).toMatchObject({
        id: old.id,
        cycleId: old.cycleId,
        generation: old.generation,
        snapshot: old.snapshot,
        sourceHash: old.sourceHash,
        hash: null,
        state: PUBLICATION_STATE.QUEUED,
      });
      expect((await currentCycle(cycle)).fileId).toBe(originalFileId);
      await broker.tick();
      expect(await consumeJobId(channel, prefix)).toBe(fresh.jobId);
      const barrier = { ...fresh, id: randomUUID(), jobId: randomUUID() };
      await deliverResult({ channel, prefix, operation: old, bytes: null });
      await deliverResult({ channel, prefix, operation: old, bytes: pdf });
      await deliverResult({ channel, prefix, operation: barrier, bytes: null });
      await drainReadyResults(channel, prefix);
      const stillPending = await latestOperation(cycle);
      expect(stillPending).toMatchObject({
        jobId: fresh.jobId,
        state: PUBLICATION_STATE.RENDERING,
        hash: null,
        pdf: null,
      });
      await deliverResult({
        channel,
        prefix,
        operation: fresh,
        bytes: orderPdf,
      });
      const expectedHash = createHash('sha256').update(orderPdf).digest('hex');
      await until(
        async (): Promise<boolean> =>
          (await latestOperation(cycle)).hash === expectedHash,
      );
      await deliverResult({ channel, prefix, operation: old, bytes: null });
      await deliverResult({ channel, prefix, operation: fresh, bytes: null });
      await deliverResult({ channel, prefix, operation: barrier, bytes: null });
      await drainReadyResults(channel, prefix);
      expect(await latestOperation(cycle)).toMatchObject({
        jobId: fresh.jobId,
        hash: expectedHash,
        state: PUBLICATION_STATE.PUBLISHING,
        pdf: orderPdf,
      });
      drive.movePublicationFile.mockRejectedValueOnce(
        new Error('Move acknowledgement unavailable after pin'),
      );
      await executor.execute(cycle.quotationId);
      const retained = await latestOperation(cycle);
      expect(retained).toMatchObject({
        jobId: fresh.jobId,
        hash: expectedHash,
        pdf: null,
        state: PUBLICATION_STATE.FAILED,
      });
      expect(retained.revisionId).not.toBeNull();
      await publication.retry(
        cycle.quotationId,
        cycle.id,
        (await currentCycle(cycle)).generation,
        PUBLICATION_TEST_PERMISSIONS,
      );
      expect(await latestOperation(cycle)).toMatchObject({
        jobId: fresh.jobId,
        hash: expectedHash,
        pdf: null,
        state: PUBLICATION_STATE.PUBLISHING,
      });
      await broker.tick();
      expect(
        (await channel.checkQueue(`${prefix}.pdf.jobs`)).messageCount,
      ).toBe(0);
      await deliverResult({ channel, prefix, operation: fresh, bytes: null });
      await deliverResult({ channel, prefix, operation: barrier, bytes: null });
      await drainReadyResults(channel, prefix);
      expect(await latestOperation(cycle)).toMatchObject({
        jobId: fresh.jobId,
        hash: expectedHash,
        state: PUBLICATION_STATE.PUBLISHING,
      });
      await executor.execute(cycle.quotationId);
      expect((await currentCycle(cycle)).fileId).toBe(originalFileId);
      expect(pdfs.get(originalFileId ?? '')).toEqual(orderPdf);
    } finally {
      await broker.beforeApplicationShutdown();
      pending.mockRestore();
      await channel.deleteQueue(`${prefix}.pdf.jobs`);
      await channel.deleteQueue(`${prefix}.pdf.results`);
      await channel.close();
      await connection.close();
    }
  });
});

describe('shared semantic publication role-folder authority', (): void => {
  it.each(Object.values(COMPLETION_ACTION))(
    'keeps the publication reserved archive ID through actual %s provisioning between prepare and confirm',
    async (action): Promise<void> => {
      const root = `completion-${randomUUID()}`;
      await setRoot(root);
      const cycle = await createReview();
      const { transactions, destinations, repository, drive } = context();
      const planned = await transactions.run(
        (transaction): Promise<IPublicationFolder> =>
          destinations.prepare(cycle, PUBLICATION_ROLE.ARCHIVE, transaction),
      );
      expect(planned.confirmed).toBe(false);
      expect(files.has(planned.folderId)).toBe(false);
      const service = completionService();
      if (action === COMPLETION_ACTION.EXPLICIT) {
        await service.completeTemplate(fixture.projectId);
      }
      if (action === COMPLETION_ACTION.AUTOMATIC) {
        await service.provision(fixture.projectId);
      }

      const beforeConfirm = [...files.keys()];
      const creates = drive.createPublicationFile.mock.calls.length;
      await transactions.run((transaction): Promise<void> =>
        destinations.confirm(cycle, planned, transaction),
      );
      const matching = [...files.values()].filter(
        (file): boolean =>
          file.name === planned.label && file.parents.includes(root),
      );
      expect(matching.map((file): string => file.id)).toEqual([
        planned.folderId,
      ]);
      const mapped = await transactions.run(
        (transaction): Promise<IPublicationFolder | null> =>
          repository.folder(
            fixture.projectId,
            root,
            PUBLICATION_ROLE.ARCHIVE,
            transaction,
          ),
      );
      expect(mapped).toMatchObject({
        folderId: planned.folderId,
        confirmed: true,
      });
      expect(drive.createPublicationFile.mock.calls).toHaveLength(creates);
      expect(beforeConfirm.every((id): boolean => files.has(id))).toBe(true);
      const legacyRoleCreates = drive.ensureFolder.mock.calls.filter(
        ([name, parent]): boolean => name === planned.label && parent === root,
      );
      expect(legacyRoleCreates).toHaveLength(0);
    },
  );

  it('does not authorize linked background creation from an unused managed reservation but explicit completion confirms its exact ID', async (): Promise<void> => {
    const root = `linked-pending-${randomUUID()}`;
    await setRoot(root);
    const old = await createReview();
    await accept(old, pdf);
    const {
      executor,
      destinations,
      transactions,
      repository,
      drive,
      publication,
    } = context();
    const preflight = jest
      .spyOn(destinations, 'confirm')
      .mockRejectedValueOnce(new Error('Stopped before folder create'));
    try {
      await executor.execute(old.quotationId);
    } finally {
      preflight.mockRestore();
    }
    const pending = await transactions.run(
      (transaction): Promise<IPublicationFolder | null> =>
        repository.folder(
          fixture.projectId,
          root,
          PUBLICATION_ROLE.QUOTATION,
          transaction,
        ),
    );
    if (!pending) {
      throw new Error('Pending semantic reservation missing');
    }

    await transactions.run((transaction): Promise<void> =>
      event(old.quotationId, 3, QUOTATION_STATUS.DRAFT, transaction),
    );
    await executor.execute(old.quotationId);
    await executor.execute(old.quotationId);
    await fixture
      .database()
      .query('UPDATE projects SET drive_folder_linked=true WHERE id=$id', {
        bind: { id: fixture.projectId },
      });
    await transactions.run((transaction): Promise<void> =>
      event(old.quotationId, 4, QUOTATION_STATUS.REVIEW, transaction),
    );
    const fresh = await transactions.run(
      async (transaction): Promise<IPublicationCycle | null> =>
        (await repository.cycles(old.quotationId, transaction)).at(-1) ?? null,
    );
    if (!fresh) {
      throw new Error('Fresh linked cycle missing');
    }

    await accept(fresh, pdf);
    const creates = drive.createPublicationFile.mock.calls.length;
    await executor.execute(old.quotationId);
    expect((await currentCycle(fresh)).state).toBe(PUBLICATION_STATE.FAILED);
    expect(drive.createPublicationFile.mock.calls).toHaveLength(creates);
    expect(files.has(pending.folderId)).toBe(false);
    await completionService().completeTemplate(fixture.projectId);
    expect(files.has(pending.folderId)).toBe(true);
    await publication.retry(
      old.quotationId,
      fresh.id,
      fresh.generation,
      PUBLICATION_TEST_PERMISSIONS,
    );
    await executor.execute(old.quotationId);
    expect((await currentCycle(fresh)).state).toBe(PUBLICATION_STATE.PUBLISHED);
    expect(files.get(pending.folderId)?.parents).toEqual([root]);
    const exactFolders = [...files.values()].filter(
      (file): boolean =>
        file.name === pending.label && file.parents.includes(root),
    );
    expect(exactFolders.map((file): string => file.id)).toEqual([
      pending.folderId,
    ]);
  });

  it('adopts a valid explicitly completed tagged template by stable role identity without changing its frozen PDF snapshot', async (): Promise<void> => {
    const root = `tagged-linked-${randomUUID()}`;
    await setRoot(root, true);
    const { repository, transactions, executor, publication, drive } =
      context();
    const [template] = await repository.select<{ id: string; name: string }>(
      `SELECT t.id,t.name FROM drive_template_folders t JOIN quotation_publication_roles r ON r.template_id=t.id WHERE r.role=$role`,
      { role: PUBLICATION_ROLE.QUOTATION },
    );
    const configured = `${DRIVE_TEMPLATE_TAGS.PROJECT_NAME} הצעות`;
    await fixture
      .database()
      .query('UPDATE drive_template_folders SET name=$name WHERE id=$id', {
        bind: { id: template.id, name: configured },
      });
    try {
      const cycle = await createReview();
      await accept(cycle, pdf);
      const [before] = await operations(cycle);
      const creates = drive.createPublicationFile.mock.calls.length;
      await executor.execute(cycle.quotationId);
      expect((await currentCycle(cycle)).state).toBe(PUBLICATION_STATE.FAILED);
      expect(drive.createPublicationFile.mock.calls).toHaveLength(creates);
      await completionService().completeTemplate(fixture.projectId);
      const completed =
        [...files.values()].find(
          (file): boolean =>
            file.name === 'Exact project הצעות' && file.parents.includes(root),
        ) ?? null;
      expect(completed).not.toBeNull();
      await publication.retry(
        cycle.quotationId,
        cycle.id,
        cycle.generation,
        PUBLICATION_TEST_PERMISSIONS,
      );
      await executor.execute(cycle.quotationId);
      expect((await currentCycle(cycle)).state).toBe(
        PUBLICATION_STATE.PUBLISHED,
      );
      const mapped = await transactions.run(
        (transaction): Promise<IPublicationFolder | null> =>
          repository.folder(
            fixture.projectId,
            root,
            PUBLICATION_ROLE.QUOTATION,
            transaction,
          ),
      );
      expect(mapped?.folderId).toBe(completed?.id);
      const [after] = await operations(cycle);
      expect(after.snapshot).toEqual(before.snapshot);
      expect(after.sourceHash).toBe(before.sourceHash);
      expect(
        [...files.values()].filter(
          (file): boolean =>
            file.name === 'Exact project הצעות' && file.parents.includes(root),
        ),
      ).toHaveLength(1);
      expect(
        [...files.values()].some(
          (file): boolean =>
            file.name === configured && file.parents.includes(root),
        ),
      ).toBe(false);
    } finally {
      await fixture
        .database()
        .query('UPDATE drive_template_folders SET name=$name WHERE id=$id', {
          bind: { id: template.id, name: template.name },
        });
    }
  });

  it('blocks a conflicting sibling instead of deleting, fuzzy-adopting or duplicating a reserved role destination', async (): Promise<void> => {
    const root = `conflict-${randomUUID()}`;
    await setRoot(root);
    const cycle = await createReview();
    const { transactions, destinations, repository, drive } = context();
    const planned = await transactions.run(
      (transaction): Promise<IPublicationFolder> =>
        destinations.prepare(cycle, PUBLICATION_ROLE.ARCHIVE, transaction),
    );
    const sibling = completeRole(root, planned.label);
    const creates = drive.createPublicationFile.mock.calls.filter(
      ([input]): boolean =>
        input.name === planned.label && input.parentId === root,
    ).length;
    await expect(
      completionService().completeTemplate(fixture.projectId),
    ).rejects.toThrow();
    expect(files.has(sibling)).toBe(true);
    expect(files.has(planned.folderId)).toBe(false);
    expect(
      drive.createPublicationFile.mock.calls.filter(
        ([input]): boolean =>
          input.name === planned.label && input.parentId === root,
      ),
    ).toHaveLength(creates);
    const mapping = await transactions.run(
      (transaction): Promise<IPublicationFolder | null> =>
        repository.folder(
          fixture.projectId,
          root,
          PUBLICATION_ROLE.ARCHIVE,
          transaction,
        ),
    );
    expect(mapping?.folderId).toBe(planned.folderId);
    expect(
      [...files.values()].filter(
        (file): boolean =>
          file.name === planned.label && file.parents.includes(root),
      ),
    ).toHaveLength(1);
  });
});

describe('durable role reservations across explicit completion failure', (): void => {
  it('commits every semantic ID before create and reuses it after lost response plus a later template rollback', async (): Promise<void> => {
    const root = `durable-completion-${randomUUID()}`;
    await setRoot(root);
    const nonRoleId = randomUUID();
    const nonRoleName = `Later non-role ${randomUUID()}`;
    await fixture
      .database()
      .query(
        'INSERT INTO drive_template_folders(id,parent_id,name,position,created_at,updated_at) VALUES($id,NULL,$name,100,now(),now())',
        { bind: { id: nonRoleId, name: nonRoleName } },
      );
    const service = completionService();
    const interrupted = interruptCompletionAfterRoleCreate(root, nonRoleName);
    try {
      await expect(service.completeTemplate(fixture.projectId)).rejects.toThrow(
        BadGatewayException,
      );
      expect(interrupted.nonRoleFailed()).toBe(true);
      expect(interrupted.createdIds.size).toBe(3);
      const original = [...interrupted.createdIds].map(
        ([role, folderId]): ICommittedRoleReservation => ({
          role,
          folderId,
        }),
      );
      for (const visible of interrupted.visibleAtCreate.values()) {
        expect(visible).toHaveLength(3);
        expect(visible).toEqual(expect.arrayContaining(original));
      }
      const afterFailure =
        await context().repository.select<ICommittedRoleReservation>(
          `SELECT role,folder_id AS "folderId" FROM quotation_publication_folders WHERE project_id=$projectId AND root_id=$rootId`,
          { projectId: fixture.projectId, rootId: root },
        );
      expect(afterFailure).toEqual(expect.arrayContaining(original));
      const creates = context().drive.createPublicationFile.mock.calls.length;
      await service.completeTemplate(fixture.projectId);
      const afterRetry =
        await context().repository.select<IConfirmedRoleReservation>(
          `SELECT role,folder_id AS "folderId",confirmed FROM quotation_publication_folders WHERE project_id=$projectId AND root_id=$rootId`,
          { projectId: fixture.projectId, rootId: root },
        );
      expect(afterRetry).toHaveLength(3);
      expect(afterRetry).toEqual(
        expect.arrayContaining(
          original.map((reservation): IConfirmedRoleReservation => ({
            ...reservation,
            confirmed: true,
          })),
        ),
      );
      expect(context().drive.createPublicationFile.mock.calls).toHaveLength(
        creates,
      );
      for (const reservation of original) {
        const actual = files.get(reservation.folderId);
        expect(actual?.parents).toEqual([root]);
        expect(
          [...files.values()].filter(
            (file): boolean =>
              file.name === actual?.name && file.parents.includes(root),
          ),
        ).toHaveLength(1);
      }
    } finally {
      interrupted.restore();
      await fixture
        .database()
        .query('DELETE FROM drive_template_folders WHERE id=$id', {
          bind: { id: nonRoleId },
        });
    }
  });
});
