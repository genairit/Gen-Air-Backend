import {
  PUBLICATION_KIND,
  PUBLICATION_ROLE,
  PUBLICATION_STATE,
  PUBLICATION_POLICY,
} from './constants/publication.constant';

import type {
  IPublicationCycle,
  IPublicationSnapshot,
} from './interfaces/publication.interface';

import { connect } from 'amqplib';
import { resolve } from 'node:path';
import { Transaction } from 'sequelize';
import { mock } from 'jest-mock-extended';
import { readFile } from 'node:fs/promises';
import { ConfigService } from '@nestjs/config';
import { randomUUID, createHash } from 'node:crypto';
import { TIME_UNITS } from '@Constants/time.constant';
import { PublicationService } from './publication.service';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { PublicationRepository } from './publication.repository';
import type { IDriveItem } from '@Interfaces/google-drive.interface';
import { PublicationBrokerService } from './publication-broker.service';
import { quotationDocumentFixture } from '../../testing/quotation.fixture';
import { PublicationExecutorService } from './publication-executor.service';
import { publicationSnapshotHash } from './utilities/publication-hash.utility';
import type { IPublicationOperation } from './interfaces/publication.interface';
import { PublicationDestinationService } from './publication-destination.service';
import { GoogleDriveService } from '@Providers/google-drive/google-drive.service';
import { QUOTATION_STATUS } from '@Modules/quotation/constants/quotation.constant';
import { TaskQuotationFixture } from '@Modules/quotation/testing/task-quotation.fixture';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import { QuotationPdfSnapshotService } from '@Modules/quotation/quotation-pdf-snapshot.service';
import type { IPublicationDriveFile } from '@Providers/google-drive/interfaces/publication-drive.interface';

interface IIntegrationContext {
  publication: PublicationService;
  repository: PublicationRepository;
  executor: PublicationExecutorService;
  transactions: DatabaseTransactionService;
  drive: ReturnType<typeof mock<GoogleDriveService>>;
  snapshots: ReturnType<typeof mock<QuotationPdfSnapshotService>>;
}
const fixture = new TaskQuotationFixture();
const state: { context: IIntegrationContext | null } = { context: null };
const files = new Map<string, IPublicationDriveFile>();
const pdfs = new Map<string, Buffer>();
const EVENT_ACTION = {
  [QUOTATION_STATUS.REVIEW]: 'submit',
  [QUOTATION_STATUS.APPROVED]: 'approve',
  [QUOTATION_STATUS.DRAFT]: 'return',
  [QUOTATION_STATUS.CANCELLED]: 'cancel',
} as const;
const ROOT = 'project-root';
const pdf = Buffer.from('%PDF-1.7\naccepted proposal');
const orderPdf = Buffer.from('%PDF-1.7\naccepted order');
jest.setTimeout(2 * TIME_UNITS.MINUTE_MS);
interface IDeferred {
  resolve: () => void;
  promise: Promise<void>;
}
const deferred = (): IDeferred => {
  const completion = {
    resolve: (): void => {
      throw new Error('Deferred not initialized');
    },
  };
  const promise = new Promise<void>((resolve): void => {
    completion.resolve = resolve;
  });
  return { promise, resolve: (): void => completion.resolve() };
};
const context = (): IIntegrationContext => {
  if (!state.context) {
    throw new Error('Integration context missing');
  }

  return state.context;
};
const snapshot = (version: number): IPublicationSnapshot => ({
  source: quotationDocumentFixture([]),
  document: {
    title: 'הצעת מחיר',
    number: '2611-000001',
    metadata: { revision: version },
  },
  filename: 'original.pdf',
  filenamePolicy: PUBLICATION_POLICY.FILENAME,
  namingInputs: { customerName: 'Original customer', brands: ['אלקטרה'] },
  rendererVersion: PUBLICATION_POLICY.RENDERER,
});
const event = async (
  quotationId: string,
  version: number,
  status: (typeof QUOTATION_STATUS)[keyof typeof QUOTATION_STATUS],
  transaction: Transaction,
): Promise<void> => {
  const eventId = randomUUID();
  const { repository, publication } = context();
  await publication.lock(quotationId, transaction);
  await repository.execute(
    `INSERT INTO quotation_lifecycle_events(id,quotation_id,action,from_status,to_status,actor_id,actor_name,occurred_at,quotation_version,reason,evidence) VALUES($id,$quotationId,$action,'draft',$status,$actorId,'Test actor',now(),$version,NULL,'{}')`,
    {
      id: eventId,
      quotationId,
      actorId: fixture.actor.id,
      status,
      version,
      action: EVENT_ACTION[status],
    },
    transaction,
  );
  const document = {
    ...quotationDocumentFixture([]),
    id: quotationId,
    customerId: fixture.customerId,
    projectId: fixture.projectId,
    status,
    version,
  };
  await publication.lifecycle({
    eventId,
    permission: PERMISSIONS.QUOTATIONS_APPROVE,
    actorId: fixture.actor.id,
    document,
    transaction,
  });
};
const createReview = async (): Promise<IPublicationCycle> => {
  const created = await fixture
    .service()
    .create(
      { customerId: fixture.customerId, projectId: fixture.projectId },
      fixture.actor,
    );
  const { transactions, repository } = context();
  await transactions.run(async (transaction): Promise<void> => {
    await event(created.id, 2, QUOTATION_STATUS.REVIEW, transaction);
  });
  return transactions.run(
    async (transaction): Promise<IPublicationCycle> =>
      (await repository.cycles(created.id, transaction))[0],
  );
};
const accept = async (
  cycle: IPublicationCycle,
  bytes: Buffer,
): Promise<void> => {
  const { transactions, repository } = context();
  await transactions.run(async (transaction): Promise<void> => {
    const operation = (await repository.operations(cycle.id, transaction)).at(
      -1,
    );
    if (!operation) {
      throw new Error('Operation missing');
    }

    await repository.execute(
      `UPDATE quotation_publication_operations SET pdf=$pdf,hash=$hash,md5_hash=$md5Hash,state='publishing' WHERE id=$id`,
      {
        id: operation.id,
        pdf: bytes,
        hash: createHash('sha256').update(bytes).digest('hex'),
        md5Hash: createHash('md5').update(bytes).digest('hex'),
      },
      transaction,
    );
  });
};
const currentCycle = (cycle: IPublicationCycle): Promise<IPublicationCycle> =>
  context().transactions.run(async (transaction): Promise<IPublicationCycle> =>
    context().repository.cycle(cycle.id, transaction),
  );
const until = async (
  predicate: () => Promise<boolean>,
  remaining = 100,
): Promise<void> => {
  if (await predicate()) {
    return;
  }

  if (!remaining) {
    throw new Error('Timed out awaiting durable result adoption');
  }

  await new Promise<void>((done): void => {
    setTimeout(done, TIME_UNITS.SECOND_MS / 20);
  });
  await until(predicate, remaining - 1);
};
beforeAll(async (): Promise<void> => {
  await fixture.start();
  await fixture.installLifecycleEvents();
  await fixture
    .database()
    .query(
      `ALTER TABLE projects ADD COLUMN drive_folder_id text,ADD COLUMN drive_folder_linked boolean NOT NULL DEFAULT false;UPDATE projects SET drive_folder_id='${ROOT}';CREATE TABLE drive_template_folders(id uuid PRIMARY KEY,parent_id uuid,name text,position integer,created_at timestamptz,updated_at timestamptz);INSERT INTO drive_template_folders VALUES(gen_random_uuid(),NULL,'הצעות מחיר',1,now(),now()),(gen_random_uuid(),NULL,'הזמנה לביצוע',2,now(),now());`,
    );
  const migration = await readFile(
    resolve(
      process.cwd(),
      'migrations/2026-11-23-quotation-publication-ledger.sql',
    ),
    'utf8',
  );
  await fixture.database().query(migration);
  await fixture.database().query(migration);
  const transactions = new DatabaseTransactionService(fixture.database());
  const repository = new PublicationRepository(fixture.database());
  const snapshots = mock<QuotationPdfSnapshotService>();
  snapshots.capture.mockImplementation(
    (document): Promise<IPublicationSnapshot> =>
      Promise.resolve({
        ...snapshot(document.version),
        source: document,
      }),
  );
  const drive = mock<GoogleDriveService>();
  files.set(ROOT, {
    id: ROOT,
    name: 'Project',
    mimeType: 'application/vnd.google-apps.folder',
    parents: ['company-root'],
    trashed: false,
    md5: null,
    revisionId: null,
    properties: {},
  });
  drive.reservePublicationId.mockImplementation((): Promise<string> =>
    Promise.resolve(randomUUID()),
  );
  drive.inspectPublicationFile.mockImplementation(
    (id): Promise<IPublicationDriveFile | null> =>
      Promise.resolve(files.get(id) ?? null),
  );
  drive.listPublicationChildren.mockImplementation(
    (root): Promise<IDriveItem[]> =>
      Promise.resolve(
        [...files.values()]
          .filter((file): boolean => file.parents.includes(root))
          .map((file): IDriveItem => ({
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            isFolder: file.mimeType === 'application/vnd.google-apps.folder',
            size: null,
            modifiedTime: null,
            webViewLink: null,
          })),
      ),
  );
  drive.createPublicationFile.mockImplementation((input): Promise<void> => {
    if (files.has(input.id)) {
      return Promise.reject(new Error('409'));
    }

    files.set(input.id, {
      id: input.id,
      name: input.name,
      mimeType: input.mimeType,
      parents: [input.parentId],
      trashed: false,
      md5: input.bytes
        ? createHash('md5').update(input.bytes).digest('hex')
        : null,
      revisionId: input.bytes ? randomUUID() : null,
      properties: input.properties,
    });
    if (input.bytes) {
      pdfs.set(input.id, input.bytes);
      return Promise.reject(new Error('Lost create response'));
    }

    return Promise.resolve();
  });
  drive.replacePublicationMedia.mockImplementation((input): Promise<void> => {
    const file = files.get(input.id);
    if (!file) {
      return Promise.reject(new Error('404'));
    }

    files.set(input.id, {
      ...file,
      name: input.name,
      md5: createHash('md5').update(input.bytes).digest('hex'),
      revisionId: randomUUID(),
    });
    pdfs.set(input.id, input.bytes);
    return Promise.resolve();
  });
  drive.movePublicationFile.mockImplementation(
    (id, parents, destination): Promise<void> => {
      const file = files.get(id);
      if (
        !file ||
        !file.parents.every((parent): boolean => parents.includes(parent))
      ) {
        return Promise.reject(new Error('Unverified source parent'));
      }

      files.set(id, { ...file, parents: [destination] });
      return Promise.resolve();
    },
  );
  drive.retainPublicationRevision.mockResolvedValue();
  const publication = new PublicationService(
    repository,
    snapshots,
    transactions,
  );
  const destinations = new PublicationDestinationService(
    repository,
    drive,
    transactions,
  );
  const executor = new PublicationExecutorService(
    repository,
    publication,
    destinations,
    transactions,
    drive,
  );
  state.context = {
    repository,
    transactions,
    snapshots,
    drive,
    publication,
    executor,
  };
});
afterAll(async (): Promise<void> => {
  await fixture.close();
});

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
      reason: 'ההפקה בוטלה לפני יצירת קובץ',
      fileUrl: null,
    });
  });
  it('blocks linked-folder completion and resumes the same failed cycle without inventing a destination', async (): Promise<void> => {
    const cycle = await createReview();
    await fixture
      .database()
      .query(
        `UPDATE projects SET drive_folder_linked=true WHERE id='${fixture.projectId}';DELETE FROM quotation_publication_folders WHERE project_id='${fixture.projectId}' AND role='quotation'`,
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
    await fixture
      .database()
      .query(
        `UPDATE projects SET drive_folder_linked=false WHERE id='${fixture.projectId}'`,
      );
    await context().publication.retry(
      cycle.quotationId,
      cycle.id,
      cycle.generation,
    );
    await context().executor.execute(cycle.quotationId);
    expect((await currentCycle(cycle)).state).toBe(PUBLICATION_STATE.PUBLISHED);
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
    await context().transactions.run(async (transaction): Promise<void> => {
      await event(cycle.quotationId, 3, QUOTATION_STATUS.DRAFT, transaction);
    });
    const otherProject = randomUUID();
    await fixture
      .database()
      .query(
        `INSERT INTO projects(id,customer_id,name,code,drive_folder_id) VALUES($id,$customerId,'Other','P-2','foreign-root')`,
        { bind: { id: otherProject, customerId: fixture.customerId } },
      );
    await context().executor.execute(cycle.quotationId);
    const archived = await currentCycle(cycle);
    expect(archived.projectId).toBe(fixture.projectId);
    expect(archived.rootId).toBe(ROOT);
    expect(archived.state).toBe(PUBLICATION_STATE.ARCHIVED);
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
        status: 'succeeded',
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
          contentType: 'application/pdf',
          cycleId: cycle.id,
          operationId: operation.id,
          generation: operation.generation,
          sourceHash: operation.sourceHash,
        },
      };
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
