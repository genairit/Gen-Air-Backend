import {
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';

import {
  QUOTATION_STATUS,
  QUOTATION_CANCELLATION_KIND,
} from '../../modules/quotation/constants/quotation.constant';

import { resolve } from 'node:path';
import { mock } from 'jest-mock-extended';
import { readFile } from 'node:fs/promises';
import type { Transaction } from 'sequelize';
import { PGlite } from '@electric-sql/pglite';
import { USER_ROLES } from '@Constants/user-role.constant';
import { quotationDocumentFixture } from '../quotation.fixture';
import type { IUser } from '@Modules/user/interfaces/user.interface';
import type { ProjectService } from '@Modules/project/project.service';
import type { CustomerService } from '@Modules/customer/customer.service';
import { QuotationService } from '../../modules/quotation/quotation.service';
import type { SaveQuotationDto } from '@Modules/quotation/dto/save-quotation.dto';
import type { QuotationRepository } from '../../modules/quotation/quotation.repository';
import type { QuotationRuleService } from '@Modules/quotation-rule/quotation-rule.service';
import type { QuotationItemService } from '@Modules/quotation-item/quotation-item.service';
import type { CatalogueItemService } from '@Modules/catalogue-item/catalogue-item.service';
import type { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import type { QuotationProjectService } from '@Modules/quotation-project/quotation-project.service';
import type { QuotationSectionService } from '@Modules/quotation-section/quotation-section.service';
import type { QuotationSelectionService } from '../../modules/quotation/quotation-selection.service';
import type { IQuotationDocument } from '../../modules/quotation/interfaces/quotation-document.interface';
import type { IQuotationDetailView } from '../../modules/quotation/interfaces/quotation-document.interface';

const quotationId = 'quotation-selected';
const projectId = 'project-linked';
const actorId = 'actor-authorized';
const transaction = mock<Transaction>();
const databaseState: { database: PGlite | null } = { database: null };
const cancellationMigrationPath = resolve(
  process.cwd(),
  'migrations/2026-11-10-quotation-cancellation.sql',
);
const getDatabase = (): PGlite => {
  if (databaseState.database === null) {
    throw new Error('Quotation transaction database unavailable');
  }

  return databaseState.database;
};

const seedSiblings = async (): Promise<void> => {
  await getDatabase().query(
    `
    INSERT INTO quotations (
      id, project_id, status, version, cancelled_from_status
    )
    VALUES
      ($1, $2, $3, 3, NULL),
      ($4, $2, $5, 5, NULL),
      ($6, $2, $7, 8, NULL),
      ($8, $2, $9, 4, $10)
    `,
    [
      'sibling-draft',
      projectId,
      QUOTATION_STATUS.DRAFT,
      'sibling-review',
      QUOTATION_STATUS.REVIEW,
      'sibling-approved',
      QUOTATION_STATUS.APPROVED,
      'sibling-cancelled',
      QUOTATION_STATUS.CANCELLED,
      QUOTATION_STATUS.REVIEW,
    ],
  );
};

const createService = (
  quotation: IQuotationDocument,
): {
  service: QuotationService;
  repository: jest.Mocked<QuotationRepository>;
  rules: jest.Mocked<QuotationRuleService>;
  transactions: jest.Mocked<DatabaseTransactionService>;
} => {
  const repository = mock<QuotationRepository>();
  const rules = mock<QuotationRuleService>();
  const sections = mock<QuotationSectionService>();
  const items = mock<QuotationItemService>();
  const catalogue = mock<CatalogueItemService>();
  const selection = mock<QuotationSelectionService>();
  const customers = mock<CustomerService>();
  const projects = mock<ProjectService>();
  const links = mock<QuotationProjectService>();
  const transactions = mock<DatabaseTransactionService>();

  transactions.run.mockImplementation(async (work) => {
    await getDatabase().exec('BEGIN');
    try {
      const result = await work(transaction);
      await getDatabase().exec('COMMIT');
      return result;
    } catch (error) {
      await getDatabase().exec('ROLLBACK');
      throw error;
    }
  });
  rules.configuration.mockResolvedValue({
    rules: quotation.ruleConfiguration,
    fingerprint: quotation.ruleConfigFingerprint,
  });
  catalogue.getByIds.mockResolvedValue([]);
  items.persistCatalogueStatuses.mockResolvedValue();
  repository.update.mockImplementation(async (id, changes) => {
    const hasCancellationHistory = 'cancellationHistory' in changes;
    const hasCancelledFromStatus = 'cancelledFromStatus' in changes;
    await getDatabase().query(
      `UPDATE quotations
       SET status = COALESCE($1, status),
           version = $2,
           cancelled_from_status = CASE WHEN $3 THEN $4 ELSE cancelled_from_status END,
           cancellation_history = CASE WHEN $5 THEN $6::jsonb ELSE cancellation_history END,
           updated_by_id = $7
       WHERE id = $8`,
      [
        changes.status ?? null,
        changes.version,
        hasCancelledFromStatus,
        changes.cancelledFromStatus ?? null,
        hasCancellationHistory,
        hasCancellationHistory
          ? JSON.stringify(changes.cancellationHistory)
          : null,
        changes.updatedById ?? null,
        id,
      ],
    );
  });

  const service = new QuotationService(
    repository,
    rules,
    sections,
    items,
    catalogue,
    selection,
    customers,
    projects,
    links,
    transactions,
  );
  jest.spyOn(service, 'document').mockResolvedValue(quotation);
  jest
    .spyOn(service, 'getById')
    .mockResolvedValue(mock<IQuotationDetailView>());
  return { service, repository, rules, transactions };
};

const quotationForOrder = (
  changes: Partial<IQuotationDocument> = {},
): IQuotationDocument => ({
  ...quotationDocumentFixture([]),
  id: quotationId,
  projectId,
  status: QUOTATION_STATUS.REVIEW,
  ...changes,
});

const saveInput = (quotation: IQuotationDocument): SaveQuotationDto => ({
  version: quotation.version,
  customerId: quotation.customerId,
  projectId: quotation.projectId,
  date: quotation.date,
  brand: quotation.brand,
  paymentTerms: quotation.paymentTerms,
  paymentTermsNote: quotation.paymentTermsNote,
  paymentSchedule: quotation.paymentSchedule,
  discountPercent: quotation.discountPercent,
  targetPretaxAmount: quotation.targetPretaxAmount,
  internalNotes: quotation.internalNotes,
  sections: [],
});

beforeEach(async () => {
  databaseState.database = new PGlite();
  const statusValues = [
    QUOTATION_STATUS.DRAFT,
    QUOTATION_STATUS.REVIEW,
    QUOTATION_STATUS.APPROVED,
  ]
    .map((status) => `'${status}'`)
    .join(', ');
  await getDatabase().exec(`
    CREATE TABLE quotations (
      id text PRIMARY KEY,
      project_id text,
      status text NOT NULL,
      version integer NOT NULL,
      updated_by_id text,
      deleted_at text,
      CONSTRAINT chk_quotation_status
        CHECK (status IN (${statusValues}))
    )
  `);
  await getDatabase().exec(await readFile(cancellationMigrationPath, 'utf8'));
  await seedSiblings();
});

afterEach(async () => {
  await getDatabase().close();
  databaseState.database = null;
  jest.restoreAllMocks();
});

describe('quotation order transaction orchestration', () => {
  test('approving a quotation keeps other project quotations unchanged', async () => {
    const quotation = quotationForOrder();
    const { service, repository } = createService(quotation);

    await service.transition(
      quotationId,
      { version: quotation.version, status: QUOTATION_STATUS.APPROVED },
      actorId,
    );

    expect(repository.update.mock.calls[0]?.[0]).toBe(quotationId);
    expect(repository.update.mock.calls[0]?.[1].status).toBe(
      QUOTATION_STATUS.APPROVED,
    );
    expect(repository.update.mock.calls[0]?.[2]).toBe(transaction);
    expect(repository.update.mock.calls).toHaveLength(1);
    const { rows } = await getDatabase().query<{ id: string; status: string }>(
      'SELECT id, status FROM quotations ORDER BY id',
    );
    expect(rows).toEqual([
      { id: 'sibling-approved', status: QUOTATION_STATUS.APPROVED },
      { id: 'sibling-cancelled', status: QUOTATION_STATUS.CANCELLED },
      { id: 'sibling-draft', status: QUOTATION_STATUS.DRAFT },
      { id: 'sibling-review', status: QUOTATION_STATUS.REVIEW },
    ]);
  });

  test('manual cancellation rejects actors without an engineering or admin role', async () => {
    const quotation = quotationForOrder();
    const { service, transactions, repository } = createService(quotation);
    const nonManager = mock<IUser>({
      id: actorId,
      role: USER_ROLES.SECRETARY,
      assignedRoles: [USER_ROLES.SECRETARY, USER_ROLES.ENGINEER],
    });

    await expect(
      service.cancel(
        quotationId,
        { version: quotation.version, reason: 'Project withdrawn' },
        nonManager,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transactions.run.mock.calls).toHaveLength(0);
    expect(repository.update.mock.calls).toHaveLength(0);
  });

  test('manual cancellation rejects a quotation that is already cancelled', async () => {
    const quotation = quotationForOrder({
      status: QUOTATION_STATUS.CANCELLED,
      cancelledFromStatus: QUOTATION_STATUS.REVIEW,
    });
    const { service, repository } = createService(quotation);
    const manager = mock<IUser>({
      id: actorId,
      firstName: 'Dana',
      lastName: 'Cohen',
      role: USER_ROLES.ENGINEER,
      assignedRoles: [USER_ROLES.ENGINEER],
    });

    await expect(
      service.cancel(
        quotationId,
        { version: quotation.version, reason: 'Project withdrawn' },
        manager,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(repository.update.mock.calls).toHaveLength(0);
  });

  test('manual cancellation rejects a missing reason before updating', async () => {
    const quotation = quotationForOrder();
    const { service, transactions, repository } = createService(quotation);
    const manager = mock<IUser>({
      id: actorId,
      role: USER_ROLES.ENGINEER,
      assignedRoles: [USER_ROLES.ENGINEER],
    });

    await expect(
      service.cancel(
        quotationId,
        { version: quotation.version, reason: '   ' },
        manager,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transactions.run.mock.calls).toHaveLength(0);
    expect(repository.update.mock.calls).toHaveLength(0);
  });

  test('authorized manual cancellation records status, version and history', async () => {
    const quotation = quotationForOrder({
      status: QUOTATION_STATUS.REVIEW,
      version: 3,
    });
    const { service } = createService(quotation);
    await getDatabase().query(
      `INSERT INTO quotations (id, project_id, status, version)
       VALUES ($1, $2, $3, $4)`,
      [quotationId, projectId, quotation.status, quotation.version],
    );
    const manager = mock<IUser>({
      id: actorId,
      firstName: 'Dana',
      lastName: 'Cohen',
      role: USER_ROLES.ENGINEER,
      assignedRoles: [USER_ROLES.ENGINEER],
    });

    await service.cancel(
      quotationId,
      { version: quotation.version, reason: '  Project withdrawn  ' },
      manager,
    );

    const { rows } = await getDatabase().query<{
      status: string;
      version: number;
      cancelled_from_status: string | null;
      cancellation_history: {
        fromStatus: string;
        cancelledById: string;
        cancelledByName: string;
        reason: string;
        cancelledAt: string;
        kind: string;
      }[];
      updated_by_id: string;
    }>(
      `SELECT status, version, cancelled_from_status,
              cancellation_history, updated_by_id
       FROM quotations
       WHERE id = $1`,
      [quotationId],
    );
    expect(rows[0]).toEqual(
      expect.objectContaining({
        status: QUOTATION_STATUS.CANCELLED,
        version: 4,
        cancelled_from_status: QUOTATION_STATUS.REVIEW,
        updated_by_id: actorId,
        cancellation_history: [
          expect.objectContaining({
            fromStatus: QUOTATION_STATUS.REVIEW,
            cancelledById: actorId,
            cancelledByName: 'Dana Cohen',
            reason: 'Project withdrawn',
            kind: QUOTATION_CANCELLATION_KIND.MANUAL,
          }),
        ],
      }),
    );
    expect(typeof rows[0]?.cancellation_history[0]?.cancelledAt).toBe('string');
  });

  test('authorized restoration records status, version and restoration history', async () => {
    const cancellationHistory = [
      {
        fromStatus: QUOTATION_STATUS.REVIEW,
        cancelledById: 'original-actor',
        cancelledByName: 'Original Actor',
        reason: 'Project withdrawn',
        cancelledAt: '2026-10-31T12:00:00.000Z',
        kind: QUOTATION_CANCELLATION_KIND.MANUAL,
        restoredById: null,
        restoredByName: null,
        restoredAt: null,
      },
    ];
    const quotation = quotationForOrder({
      status: QUOTATION_STATUS.CANCELLED,
      cancelledFromStatus: QUOTATION_STATUS.REVIEW,
      cancellationHistory,
      version: 4,
    });
    const { service } = createService(quotation);
    await getDatabase().query(
      `INSERT INTO quotations (
         id, project_id, status, version, cancelled_from_status,
         cancellation_history
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        quotationId,
        projectId,
        quotation.status,
        quotation.version,
        quotation.cancelledFromStatus,
        JSON.stringify(cancellationHistory),
      ],
    );
    const manager = mock<IUser>({
      id: actorId,
      firstName: 'Rina',
      lastName: 'Levy',
      role: USER_ROLES.SYSTEM_ADMIN,
      assignedRoles: [USER_ROLES.SYSTEM_ADMIN],
    });

    await service.restore(quotationId, { version: quotation.version }, manager);

    const { rows } = await getDatabase().query<{
      status: string;
      version: number;
      cancelled_from_status: string | null;
      cancellation_history: {
        restoredAt: string;
        restoredById: string;
        restoredByName: string;
      }[];
      updated_by_id: string;
    }>(
      `SELECT status, version, cancelled_from_status,
              cancellation_history, updated_by_id
       FROM quotations
       WHERE id = $1`,
      [quotationId],
    );
    expect(rows[0]).toEqual(
      expect.objectContaining({
        status: QUOTATION_STATUS.REVIEW,
        version: 5,
        cancelled_from_status: null,
        updated_by_id: actorId,
        cancellation_history: [
          expect.objectContaining({
            fromStatus: QUOTATION_STATUS.REVIEW,
            cancelledById: 'original-actor',
            cancelledByName: 'Original Actor',
            reason: 'Project withdrawn',
            kind: QUOTATION_CANCELLATION_KIND.MANUAL,
            restoredById: actorId,
            restoredByName: 'Rina Levy',
          }),
        ],
      }),
    );
    expect(typeof rows[0]?.cancellation_history[0]?.restoredAt).toBe('string');
  });

  test('restoration rejects a history whose prior status differs from the cancelled status', async () => {
    const quotation = quotationForOrder({
      status: QUOTATION_STATUS.CANCELLED,
      cancelledFromStatus: QUOTATION_STATUS.REVIEW,
      cancellationHistory: [
        {
          fromStatus: QUOTATION_STATUS.DRAFT,
          cancelledById: 'original-actor',
          cancelledByName: 'Original Actor',
          reason: 'Project withdrawn',
          cancelledAt: '2026-10-31T12:00:00.000Z',
          kind: QUOTATION_CANCELLATION_KIND.MANUAL,
          restoredById: null,
          restoredByName: null,
          restoredAt: null,
        },
      ],
    });
    const { service, repository } = createService(quotation);
    const manager = mock<IUser>({
      id: actorId,
      role: USER_ROLES.SYSTEM_ADMIN,
      assignedRoles: [USER_ROLES.SYSTEM_ADMIN],
    });

    await expect(
      service.restore(quotationId, { version: quotation.version }, manager),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(repository.update.mock.calls).toHaveLength(0);
  });

  test('restoration rejects a cancelled quotation without history', async () => {
    const quotation = quotationForOrder({
      status: QUOTATION_STATUS.CANCELLED,
      cancelledFromStatus: QUOTATION_STATUS.REVIEW,
      cancellationHistory: [],
    });
    const { service, repository } = createService(quotation);
    const manager = mock<IUser>({
      id: actorId,
      role: USER_ROLES.SYSTEM_ADMIN,
      assignedRoles: [USER_ROLES.SYSTEM_ADMIN],
    });

    await expect(
      service.restore(quotationId, { version: quotation.version }, manager),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(repository.update.mock.calls).toHaveLength(0);
  });

  test('restoration rejects actors without an active admin role', async () => {
    const quotation = quotationForOrder({
      status: QUOTATION_STATUS.CANCELLED,
      cancelledFromStatus: QUOTATION_STATUS.REVIEW,
    });
    const { service, transactions, repository } = createService(quotation);
    const nonManager = mock<IUser>({
      id: actorId,
      role: USER_ROLES.ENGINEER,
      assignedRoles: [USER_ROLES.ENGINEER, USER_ROLES.SYSTEM_ADMIN],
    });

    await expect(
      service.restore(quotationId, { version: quotation.version }, nonManager),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(transactions.run.mock.calls).toHaveLength(0);
    expect(repository.update.mock.calls).toHaveLength(0);
  });

  test('saving a cancelled quotation is rejected without updating it', async () => {
    const quotation = quotationForOrder({
      projectId: null,
      status: QUOTATION_STATUS.CANCELLED,
      cancelledFromStatus: QUOTATION_STATUS.REVIEW,
    });
    const { service, repository } = createService(quotation);

    await expect(
      service.save(quotationId, saveInput(quotation), actorId),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(repository.update.mock.calls).toHaveLength(0);
  });

  test('acknowledging warnings on a cancelled quotation is rejected without updating it', async () => {
    const quotation = quotationForOrder({
      status: QUOTATION_STATUS.CANCELLED,
      cancelledFromStatus: QUOTATION_STATUS.REVIEW,
    });
    const { service, repository } = createService(quotation);

    await expect(
      service.acknowledge(
        quotationId,
        { version: quotation.version, warningKeys: [] },
        actorId,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(repository.update.mock.calls).toHaveLength(0);
  });

  test('migration replaces the existing status constraint and accepts cancelled', async () => {
    const { rows } = await getDatabase().query<{
      constraint_definition: string;
    }>(
      `SELECT pg_get_constraintdef(oid) AS constraint_definition
       FROM pg_constraint
       WHERE conname = 'chk_quotations_status'`,
    );
    expect(rows[0]?.constraint_definition).toContain(
      `'${QUOTATION_STATUS.CANCELLED}'::text`,
    );
    await getDatabase().query(
      `INSERT INTO quotations (
         id, project_id, status, version, cancelled_from_status
       )
       VALUES ($1, $2, $3, $4, $5)`,
      [
        'constraint-cancelled',
        projectId,
        QUOTATION_STATUS.CANCELLED,
        1,
        QUOTATION_STATUS.REVIEW,
      ],
    );
    await expect(
      getDatabase().query(
        `INSERT INTO quotations (id, project_id, status, version)
         VALUES ($1, $2, $3, $4)`,
        ['constraint-invalid', projectId, 'unexpected', 1],
      ),
    ).rejects.toThrow();
  });
});
