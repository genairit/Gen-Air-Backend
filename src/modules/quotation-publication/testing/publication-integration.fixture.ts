import type {
  IPublicationCycle,
  IPublicationSnapshot,
} from '../interfaces/publication.interface';

import { resolve } from 'node:path';
import { Transaction } from 'sequelize';
import { mock } from 'jest-mock-extended';
import { readFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { TIME_UNITS } from '@Constants/time.constant';
import { PublicationService } from '../publication.service';
import { GOOGLE_DRIVE } from '@Constants/google-drive.constant';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { PublicationRepository } from '../publication.repository';
import type { IDriveItem } from '@Interfaces/google-drive.interface';
import { PUBLICATION_POLICY } from '../constants/publication.constant';
import { PublicationExecutorService } from '../publication-executor.service';
import { quotationDocumentFixture } from '../../../testing/quotation.fixture';
import type { IPublicationOperation } from '../interfaces/publication.interface';
import { GoogleDriveService } from '@Providers/google-drive/google-drive.service';
import { PublicationDestinationService } from '../publication-destination.service';
import { QUOTATION_STATUS } from '@Modules/quotation/constants/quotation.constant';
import { TaskQuotationFixture } from '@Modules/quotation/testing/task-quotation.fixture';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import { QuotationPdfSnapshotService } from '@Modules/quotation/quotation-pdf-snapshot.service';
import { QUOTATION_LIFECYCLE_ACTION } from '@Modules/quotation/constants/quotation-lifecycle.constant';
import type { IPublicationDriveFile } from '@Providers/google-drive/interfaces/publication-drive.interface';

export interface IDeferred {
  resolve: () => void;
  promise: Promise<void>;
}
interface ILifecycleEventInput {
  version: number;
  quotationId: string;
  transaction: Transaction;
  projectId?: string | null;
  status: (typeof QUOTATION_STATUS)[keyof typeof QUOTATION_STATUS];
  permission?: import('@Constants/authorization.constant').PermissionType;
  action?: (typeof QUOTATION_LIFECYCLE_ACTION)[keyof typeof QUOTATION_LIFECYCLE_ACTION];
}
export interface IIntegrationContext {
  publication: PublicationService;
  repository: PublicationRepository;
  executor: PublicationExecutorService;
  transactions: DatabaseTransactionService;
  destinations: PublicationDestinationService;
  drive: ReturnType<typeof mock<GoogleDriveService>>;
  snapshots: ReturnType<typeof mock<QuotationPdfSnapshotService>>;
}
export const fixture = new TaskQuotationFixture();
const state: { context: IIntegrationContext | null } = { context: null };
export const files = new Map<string, IPublicationDriveFile>();
export const pdfs = new Map<string, Buffer>();
const EVENT_ACTION = {
  [QUOTATION_STATUS.REVIEW]: QUOTATION_LIFECYCLE_ACTION.SUBMIT,
  [QUOTATION_STATUS.APPROVED]: QUOTATION_LIFECYCLE_ACTION.APPROVE,
  [QUOTATION_STATUS.DRAFT]: QUOTATION_LIFECYCLE_ACTION.RETURN,
  [QUOTATION_STATUS.CANCELLED]: QUOTATION_LIFECYCLE_ACTION.CANCEL,
} as const;
export const PUBLICATION_TEST_PERMISSIONS = [
  PERMISSIONS.QUOTATIONS_UPDATE,
  PERMISSIONS.QUOTATIONS_APPROVE,
] as const;
export const ROOT = 'project-root';
export const pdf = Buffer.from('%PDF-1.7\naccepted proposal');
export const orderPdf = Buffer.from('%PDF-1.7\naccepted order');
jest.setTimeout(2 * TIME_UNITS.MINUTE_MS);
export const deferred = (): IDeferred => {
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
export const context = (): IIntegrationContext => {
  if (!state.context) {
    throw new Error('Integration context missing');
  }

  return state.context;
};
export const snapshot = (version: number): IPublicationSnapshot => ({
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
export const lifecycleEvent = async (
  input: ILifecycleEventInput,
): Promise<void> => {
  const { quotationId, version, status, transaction } = input;
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
      action: input.action ?? EVENT_ACTION[status],
    },
    transaction,
  );
  const document = {
    ...quotationDocumentFixture([]),
    id: quotationId,
    customerId: fixture.customerId,
    projectId:
      'projectId' in input ? (input.projectId ?? null) : fixture.projectId,
    status,
    version,
  };
  await publication.lifecycle({
    eventId,
    permission: input.permission ?? PERMISSIONS.QUOTATIONS_APPROVE,
    actorId: fixture.actor.id,
    document,
    transaction,
  });
};
export const event = (
  quotationId: string,
  version: number,
  status: ILifecycleEventInput['status'],
  transaction: Transaction,
): Promise<void> =>
  lifecycleEvent({ quotationId, version, status, transaction });
export const createReview = async (): Promise<IPublicationCycle> => {
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
export const accept = async (
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
export const currentCycle = (
  cycle: IPublicationCycle,
): Promise<IPublicationCycle> =>
  context().transactions.run(async (transaction): Promise<IPublicationCycle> =>
    context().repository.cycle(cycle.id, transaction),
  );
export const until = async (
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
export const startPublicationFixture = async (): Promise<void> => {
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
    mimeType: GOOGLE_DRIVE.FOLDER_MIME_TYPE,
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
            isFolder: file.mimeType === GOOGLE_DRIVE.FOLDER_MIME_TYPE,
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
    destinations,
  };
};
export const closePublicationFixture = async (): Promise<void> => {
  await fixture.close();
};

export const operations = (
  cycle: IPublicationCycle,
): Promise<IPublicationOperation[]> =>
  context().transactions.run((transaction): Promise<IPublicationOperation[]> =>
    context().repository.operations(cycle.id, transaction),
  );
export const setRoot = async (
  rootId: string,
  linked = false,
): Promise<void> => {
  files.set(rootId, {
    id: rootId,
    name: rootId,
    mimeType: GOOGLE_DRIVE.FOLDER_MIME_TYPE,
    parents: ['company-root'],
    trashed: false,
    md5: null,
    revisionId: null,
    properties: {},
  });
  await fixture
    .database()
    .query(
      'UPDATE projects SET drive_folder_id=$rootId,drive_folder_linked=$linked WHERE id=$projectId',
      { bind: { rootId, linked, projectId: fixture.projectId } },
    );
};
export const completeRole = (rootId: string, roleName: string): string => {
  const id = randomUUID();
  files.set(id, {
    id,
    name: roleName,
    mimeType: GOOGLE_DRIVE.FOLDER_MIME_TYPE,
    parents: [rootId],
    trashed: false,
    md5: null,
    revisionId: null,
    properties: {},
  });
  return id;
};
