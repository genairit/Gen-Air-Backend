import {
  PAYMENT_TERMS,
  PAYMENT_TERMS_VALUES,
} from '@Constants/payment-terms.constant';

import { Test } from '@nestjs/testing';
import { Transaction } from 'sequelize';
import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { mock, MockProxy } from 'jest-mock-extended';
import { UserService } from '@Modules/user/user.service';
import { authorizedUser } from './authorization.fixture';
import { USER_ROLES } from '@Constants/user-role.constant';
import { quotationDocumentFixture } from './quotation.fixture';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { ProjectService } from '@Modules/project/project.service';
import { CustomerService } from '@Modules/customer/customer.service';
import { UserRoleService } from '@Modules/user-role/user-role.service';
import { QuotationService } from '@Modules/quotation/quotation.service';
import { Quotation } from '@Modules/quotation/entities/quotation.entity';
import { QuotationRepository } from '@Modules/quotation/quotation.repository';
import type { ICustomer } from '@Modules/customer/interfaces/customer.interface';
import type { SaveQuotationDto } from '@Modules/quotation/dto/save-quotation.dto';
import { QUOTATION_STATUS } from '@Modules/quotation/constants/quotation.constant';
import type { IQuotation } from '@Modules/quotation/interfaces/quotation.interface';
import { QuotationRuleService } from '@Modules/quotation-rule/quotation-rule.service';
import { CatalogueItemService } from '@Modules/catalogue-item/catalogue-item.service';
import { QuotationItemService } from '@Modules/quotation-item/quotation-item.service';
import { QuotationSelectionService } from '@Modules/quotation/quotation-selection.service';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import { QuotationSectionService } from '@Modules/quotation-section/quotation-section.service';
import { QuotationProjectService } from '@Modules/quotation-project/quotation-project.service';

const makeCustomer = (): ICustomer => ({
  id: randomUUID(),
  name: 'Payment customer',
  phone: '0500000000',
  email: 'payment@example.invalid',
  taxId: '123456789',
  address: 'Test address',
  contactName: 'Test contact',
  customerType: 'company',
  createdById: randomUUID(),
  createdAt: new Date('2026-11-01T10:00:00Z'),
  updatedAt: new Date('2026-11-01T10:00:00Z'),
  deletedAt: null,
  priorityId: null,
  prioritySyncedAt: null,
  prioritySyncError: null,
  prioritySyncStatus: 'pending',
  prioritySyncAttempts: 0,
  paymentTerms: PAYMENT_TERMS.PREPAID,
});

const quotationModel = (row: IQuotation): MockProxy<Quotation> => {
  const model = mock<Quotation>();
  Object.assign(model, row);
  model.toJSON.mockReturnValue(row);
  return model;
};

const createContext = async () => {
  const actor = {
    ...authorizedUser([PERMISSIONS.EMPLOYEES_READ]),
    id: randomUUID(),
  };
  const customer = makeCustomer();
  const rows = new Map<string, IQuotation>();
  const transaction = mock<Transaction>();
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
  const users = mock<UserService>();
  const userRoles = mock<UserRoleService>();
  const document = quotationDocumentFixture([]);
  const run = <T>(work: (value: Transaction) => Promise<T>): Promise<T> =>
    work(transaction);

  transactions.run.mockImplementation(run);
  transactions.lockKey.mockResolvedValue();
  rules.configuration.mockResolvedValue({
    rules: document.ruleConfiguration,
    fingerprint: document.ruleConfigFingerprint,
  });
  customers.getById.mockResolvedValue(customer);
  links.primaryProject.mockResolvedValue(null);
  links.primaryProjects.mockResolvedValue(new Map());
  links.apartmentLinks.mockResolvedValue(new Map());
  links.countApartmentLinks.mockResolvedValue(0);
  links.replacePrimary.mockResolvedValue();
  sections.list.mockResolvedValue([]);
  items.list.mockResolvedValue([]);
  catalogue.getByIds.mockResolvedValue([]);
  selection.snapshots.mockResolvedValue([]);
  sections.remove.mockResolvedValue();
  sections.insert.mockResolvedValue();
  items.remove.mockResolvedValue();
  items.insert.mockResolvedValue();
  repository.nextNumber.mockResolvedValue('2611-000001');
  repository.create.mockImplementation(async (attributes) => {
    const row: IQuotation = {
      ...attributes,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    rows.set(row.id, row);
    return quotationModel(row);
  });
  repository.findById.mockImplementation(async (id) => {
    const row = rows.get(id);
    return row ? quotationModel(row) : null;
  });
  repository.update.mockImplementation(async (id, changes) => {
    const row = rows.get(id);
    if (!row) {
      throw new Error('Quotation fixture row not found');
    }
    rows.set(id, { ...row, ...changes });
  });

  const module = await Test.createTestingModule({
    providers: [
      QuotationService,
      { provide: QuotationRepository, useValue: repository },
      { provide: QuotationRuleService, useValue: rules },
      { provide: QuotationSectionService, useValue: sections },
      { provide: QuotationItemService, useValue: items },
      { provide: CatalogueItemService, useValue: catalogue },
      { provide: QuotationSelectionService, useValue: selection },
      { provide: CustomerService, useValue: customers },
      { provide: ProjectService, useValue: projects },
      { provide: QuotationProjectService, useValue: links },
      { provide: DatabaseTransactionService, useValue: transactions },
      { provide: UserService, useValue: users },
      { provide: UserRoleService, useValue: userRoles },
    ],
  }).compile();

  return {
    actor,
    module,
    customer,
    customers,
    repository,
    transaction,
    transactions,
    sections,
    items,
    selection,
    users,
    userRoles,
    service: module.get(QuotationService),
  };
};

const saveInput = (quotation: IQuotation): SaveQuotationDto => ({
  version: quotation.version,
  customerId: quotation.customerId,
  projectId: null,
  salesAgentId: quotation.salesAgentId,
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

const state: { context: Awaited<ReturnType<typeof createContext>> | null } = {
  context: null,
};
const context = () => {
  if (!state.context) {
    throw new Error('Payment test context unavailable');
  }
  return state.context;
};

beforeEach(async () => {
  state.context = await createContext();
});

afterEach(async () => {
  await context().module.close();
  state.context = null;
});

describe('QuotationService card100 payment ownership', () => {
  test('approval rejects conflicting or incomplete staged terms', async () => {
    const { service, customer, repository, actor, transaction } = context();
    const quotation = await service.create({ customerId: customer.id }, actor);
    const stages = [
      { percent: '30', text: 'בחתימה' },
      { percent: '70', text: 'במסירה' },
    ];
    await repository.update(
      quotation.id,
      {
        status: QUOTATION_STATUS.REVIEW,
        paymentTerms: PAYMENT_TERMS.PREPAID,
        paymentSchedule: stages,
      },
      transaction,
    );
    await expect(
      service.transition(
        quotation.id,
        { version: quotation.version, status: QUOTATION_STATUS.APPROVED },
        actor.id,
      ),
    ).rejects.toThrow('נבחרו גם תנאי תשלום קבועים וגם שלבי תשלום');
    await repository.update(
      quotation.id,
      {
        paymentTerms: null,
        paymentSchedule: [{ percent: '30', text: '' }, stages[1]],
      },
      transaction,
    );
    await expect(
      service.transition(
        quotation.id,
        { version: quotation.version, status: QUOTATION_STATUS.APPROVED },
        actor.id,
      ),
    ).rejects.toThrow('יש לתאר את מועד התשלום של כל שלב');
    await repository.update(
      quotation.id,
      { paymentSchedule: stages },
      transaction,
    );
    const approved = await service.transition(
      quotation.id,
      { version: quotation.version, status: QUOTATION_STATUS.APPROVED },
      actor.id,
    );
    expect(approved.status).toBe(QUOTATION_STATUS.APPROVED);
  });
  describe('create', () => {
    test('persists an eligible sales agent selected during creation', async () => {
      const { service, customer, users, repository, actor, transaction } =
        context();
      const agentId = randomUUID();
      users.findById.mockResolvedValue({
        id: agentId,
        firstName: 'Sales',
        lastName: 'Engineer',
        email: 'sales@example.invalid',
        phone: '0500000000',
        role: USER_ROLES.SALES_AGENT,
        assignedRoles: [USER_ROLES.SALES_AGENT],
        employeeNumber: 'E-1',
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const quotation = await service.create(
        { customerId: customer.id, salesAgentId: agentId },
        actor,
      );

      expect(quotation.salesAgentId).toBe(agentId);
      expect(repository.create.mock.calls[0]).toEqual([
        expect.objectContaining({ salesAgentId: agentId }),
        transaction,
      ]);
    });

    test('rejects a sales agent who is not an active eligible-role user', async () => {
      const { service, customer, users, repository, actor } = context();
      users.findById.mockResolvedValue(null);

      await expect(
        service.create(
          { customerId: customer.id, salesAgentId: randomUUID() },
          actor,
        ),
      ).rejects.toThrow('יש לבחור עובד פעיל בתפקיד סוכן מכירות');

      expect(repository.create.mock.calls).toHaveLength(0);
    });

    test.each([...PAYMENT_TERMS_VALUES, null])(
      'immediately persists customer payment default %s with an empty local note',
      async (paymentTerms) => {
        const { service, customer, repository, transaction, actor } = context();
        customer.paymentTerms = paymentTerms;
        const originalCustomer = { ...customer };

        const quotation = await service.create(
          { customerId: customer.id },
          actor,
        );

        expect(quotation.paymentTerms).toBe(paymentTerms);
        expect(quotation.paymentTermsNote).toBe('');
        expect(quotation.paymentSchedule).toEqual([]);
        expect(repository.create).toHaveBeenCalledTimes(1);
        expect(repository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            id: quotation.id,
            customerId: customer.id,
            paymentTerms,
            paymentTermsNote: '',
            paymentSchedule: [],
            createdById: actor.id,
          }),
          transaction,
        );
        expect(repository.update).not.toHaveBeenCalled();
        expect(customer).toEqual(originalCustomer);
      },
    );

    test('normalizes an omitted optional customer default to null', async () => {
      const { service, customer, customers, repository, actor } = context();
      const { paymentTerms, ...withoutPaymentTerms } = customer;
      void paymentTerms;
      customers.getById.mockResolvedValue(withoutPaymentTerms);

      const quotation = await service.create(
        { customerId: customer.id },
        actor,
      );

      expect(quotation.paymentTerms).toBeNull();
      expect(quotation.paymentTermsNote).toBe('');
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ paymentTerms: null, paymentTermsNote: '' }),
        context().transaction,
      );
    });

    test('rejects a missing customer before creating a quotation', async () => {
      const { service, customer, customers, repository, transactions, actor } =
        context();
      const message = `Customer ${customer.id} was not found`;
      customers.getById.mockRejectedValue(new NotFoundException(message));

      const result = service.create({ customerId: customer.id }, actor);

      await expect(result).rejects.toThrow(NotFoundException);
      await expect(result).rejects.toMatchObject({ message, status: 404 });
      expect(repository.create).not.toHaveBeenCalled();
      expect(transactions.run).not.toHaveBeenCalled();
    });

    test('propagates a persistence error without modifying the customer', async () => {
      const { service, customer, customers, repository, actor } = context();
      const originalCustomer = { ...customer };
      repository.create.mockRejectedValue(new Error('Payment snapshot failed'));

      await expect(
        service.create({ customerId: customer.id }, actor),
      ).rejects.toThrow('Payment snapshot failed');

      expect(customer).toEqual(originalCustomer);
      expect(customers.update).not.toHaveBeenCalled();
      expect(repository.findById).not.toHaveBeenCalled();
    });
  });

  describe('save', () => {
    test('persists a quotation override, note and schedule without updating the customer', async () => {
      const { service, customer, customers, repository, transaction, actor } =
        context();
      const quotation = await service.create(
        { customerId: customer.id },
        actor,
      );
      const originalCustomer = { ...customer };
      const input: SaveQuotationDto = {
        ...saveInput(quotation),
        paymentTerms: PAYMENT_TERMS.OTHER,
        paymentTermsNote: 'Quotation-only agreed terms',
        paymentSchedule: [{ percent: '100', text: 'On delivery' }],
      };

      const saved = await service.save(quotation.id, input, actor);

      expect(saved).toMatchObject({
        paymentTerms: input.paymentTerms,
        paymentTermsNote: input.paymentTermsNote,
        paymentSchedule: input.paymentSchedule,
        version: 2,
      });
      expect(repository.update).toHaveBeenCalledWith(
        quotation.id,
        expect.objectContaining({
          paymentTerms: input.paymentTerms,
          paymentTermsNote: input.paymentTermsNote,
          paymentSchedule: input.paymentSchedule,
          updatedById: actor.id,
          version: 2,
        }),
        transaction,
      );
      expect(repository.update).toHaveBeenCalledTimes(1);
      expect(customers.update).not.toHaveBeenCalled();
      expect(customer).toEqual(originalCustomer);
    });

    test('later customer defaults neither rewrite a saved snapshot nor override explicit save input', async () => {
      const { service, customer, customers, actor } = context();
      const quotation = await service.create(
        { customerId: customer.id },
        actor,
      );
      customer.paymentTerms = PAYMENT_TERMS.MILESTONES_NET_60;

      const reloaded = await service.getById(quotation.id);
      expect(reloaded.paymentTerms).toBe(PAYMENT_TERMS.PREPAID);
      expect(reloaded.paymentTermsNote).toBe('');

      const saved = await service.save(
        quotation.id,
        {
          ...saveInput(reloaded),
          paymentTerms: PAYMENT_TERMS.TWELVE_PREPAID_CHECKS,
          paymentTermsNote: 'Quote-specific override after default change',
        },
        actor,
      );
      customer.paymentTerms = PAYMENT_TERMS.OTHER;
      const afterAnotherChange = await service.getById(quotation.id);

      expect(saved.paymentTerms).toBe(PAYMENT_TERMS.TWELVE_PREPAID_CHECKS);
      expect(afterAnotherChange.paymentTerms).toBe(saved.paymentTerms);
      expect(afterAnotherChange.paymentTermsNote).toBe(saved.paymentTermsNote);
      expect(customer.paymentTerms).toBe(PAYMENT_TERMS.OTHER);
      expect(customers.update).not.toHaveBeenCalled();
    });

    test('keeps a null snapshot when the customer later gains a default', async () => {
      const { service, customer, actor } = context();
      customer.paymentTerms = null;
      const quotation = await service.create(
        { customerId: customer.id },
        actor,
      );
      customer.paymentTerms = PAYMENT_TERMS.PREPAID;

      const saved = await service.save(
        quotation.id,
        saveInput(quotation),
        actor,
      );

      expect(saved.paymentTerms).toBeNull();
      expect(saved.paymentTermsNote).toBe('');
      expect(customer.paymentTerms).toBe(PAYMENT_TERMS.PREPAID);
    });

    test('allows explicit clearing of quotation payment terms and note', async () => {
      const { service, customer, customers, actor } = context();
      const quotation = await service.create(
        { customerId: customer.id },
        actor,
      );
      const overridden = await service.save(
        quotation.id,
        {
          ...saveInput(quotation),
          paymentTerms: PAYMENT_TERMS.OTHER,
          paymentTermsNote: 'Temporary local note',
        },
        actor,
      );

      const cleared = await service.save(
        quotation.id,
        {
          ...saveInput(overridden),
          paymentTerms: null,
          paymentTermsNote: '',
        },
        actor,
      );

      expect(cleared.paymentTerms).toBeNull();
      expect(cleared.paymentTermsNote).toBe('');
      expect(customer.paymentTerms).toBe(PAYMENT_TERMS.PREPAID);
      expect(customers.update).not.toHaveBeenCalled();
    });

    test.each([PAYMENT_TERMS.PREPAID, PAYMENT_TERMS.OTHER, null])(
      'on customer change persists explicit quote terms %s instead of the new default',
      async (paymentTerms) => {
        const { service, customer, customers, repository, transaction, actor } =
          context();
        const quotation = await service.create(
          { customerId: customer.id },
          actor,
        );
        const nextCustomer = makeCustomer();
        nextCustomer.paymentTerms = PAYMENT_TERMS.INSTALLMENTS_10_60_30;
        const originalCustomer = { ...customer };
        const originalNextCustomer = { ...nextCustomer };
        customers.getById.mockResolvedValue(nextCustomer);
        const input: SaveQuotationDto = {
          ...saveInput(quotation),
          customerId: nextCustomer.id,
          paymentTerms,
          paymentTermsNote: 'Explicit note retained across customer change',
        };

        const saved = await service.save(quotation.id, input, actor);

        expect(saved).toMatchObject({
          customerId: nextCustomer.id,
          paymentTerms,
          paymentTermsNote: input.paymentTermsNote,
        });
        expect(customers.getById).toHaveBeenLastCalledWith(nextCustomer.id);
        expect(repository.update).toHaveBeenCalledWith(
          quotation.id,
          expect.objectContaining({
            customerId: nextCustomer.id,
            paymentTerms,
            paymentTermsNote: input.paymentTermsNote,
          }),
          transaction,
        );
        expect(customer).toEqual(originalCustomer);
        expect(nextCustomer).toEqual(originalNextCustomer);
        expect(customers.update).not.toHaveBeenCalled();
      },
    );

    test('rejects a missing replacement customer before mutating a saved quotation', async () => {
      const {
        service,
        customer,
        customers,
        repository,
        sections,
        items,
        actor,
      } = context();
      const quotation = await service.create(
        { customerId: customer.id },
        actor,
      );
      const missingId = randomUUID();
      const message = `Customer ${missingId} was not found`;
      customers.getById.mockRejectedValue(new NotFoundException(message));

      const result = service.save(
        quotation.id,
        { ...saveInput(quotation), customerId: missingId },
        actor,
      );

      await expect(result).rejects.toThrow(NotFoundException);
      await expect(result).rejects.toMatchObject({ message, status: 404 });
      expect(repository.update).not.toHaveBeenCalled();
      expect(sections.remove).not.toHaveBeenCalled();
      expect(items.remove).not.toHaveBeenCalled();
      expect((await service.getById(quotation.id)).paymentTerms).toBe(
        PAYMENT_TERMS.PREPAID,
      );
    });

    test('propagates a save failure without writing the override to the customer', async () => {
      const { service, customer, customers, repository, actor } = context();
      const quotation = await service.create(
        { customerId: customer.id },
        actor,
      );
      const originalCustomer = { ...customer };
      repository.update.mockRejectedValue(new Error('Payment override failed'));

      await expect(
        service.save(
          quotation.id,
          {
            ...saveInput(quotation),
            paymentTerms: PAYMENT_TERMS.OTHER,
            paymentTermsNote: 'Unpersisted override',
          },
          actor,
        ),
      ).rejects.toThrow('Payment override failed');

      expect(customers.update).not.toHaveBeenCalled();
      expect(customer).toEqual(originalCustomer);
    });
  });

  test('saving an unchanged historical sales agent keeps the association after the agent becomes unavailable', async () => {
    const { service, customer, users, repository, actor, transaction } =
      context();
    const agentId = randomUUID();
    users.findById.mockResolvedValue({
      id: agentId,
      firstName: 'Sales',
      lastName: 'Engineer',
      email: 'sales@example.invalid',
      phone: '0500000000',
      role: USER_ROLES.SALES_AGENT,
      assignedRoles: [USER_ROLES.SALES_AGENT],
      employeeNumber: 'E-1',
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const created = await service.create(
      { customerId: customer.id, salesAgentId: agentId },
      actor,
    );
    users.findById.mockResolvedValue(null);
    users.findByIdIncludingDeleted.mockResolvedValue({
      id: agentId,
      firstName: 'Sales',
      lastName: 'Engineer',
      email: 'sales@example.invalid',
      phone: '0500000000',
      role: USER_ROLES.SECRETARY,
      employeeNumber: 'E-1',
      deletedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const saved = await service.save(created.id, saveInput(created), {
      ...actor,
      permissions: [],
    });

    expect(saved.salesAgentId).toBe(agentId);
    expect(saved.salesAgentName).toBe('Sales Engineer · E-1');
    expect(users.findById.mock.calls).toHaveLength(1);
    expect(repository.update.mock.calls).toContainEqual([
      created.id,
      expect.objectContaining({ salesAgentId: agentId }),
      transaction,
    ]);
  });
});
