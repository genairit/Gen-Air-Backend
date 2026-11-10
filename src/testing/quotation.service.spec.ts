import {
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';

import { mock } from 'jest-mock-extended';
import type { Transaction } from 'sequelize';
import { authorizedUser } from './authorization.fixture';
import { USER_ROLES } from '@Constants/user-role.constant';
import type { UserService } from '@Modules/user/user.service';
import { quotationDocumentFixture } from './quotation.fixture';
import { PERMISSIONS } from '@Constants/authorization.constant';
import type { IUser } from '@Modules/user/interfaces/user.interface';
import type { ProjectService } from '@Modules/project/project.service';
import { QuotationService } from '../modules/quotation/quotation.service';
import type { CustomerService } from '@Modules/customer/customer.service';
import type { UserRoleService } from '@Modules/user-role/user-role.service';
import type { SaveQuotationDto } from '../modules/quotation/dto/save-quotation.dto';
import type { QuotationRepository } from '../modules/quotation/quotation.repository';
import { QUOTATION_STATUS } from '../modules/quotation/constants/quotation.constant';
import type { QuotationItemService } from '@Modules/quotation-item/quotation-item.service';
import type { QuotationRuleService } from '@Modules/quotation-rule/quotation-rule.service';
import type { CatalogueItemService } from '@Modules/catalogue-item/catalogue-item.service';
import type { QuotationSelectionService } from '../modules/quotation/quotation-selection.service';
import type { IQuotationView } from '../modules/quotation/interfaces/quotation-document.interface';
import type { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import type { QuotationProjectService } from '@Modules/quotation-project/quotation-project.service';
import type { QuotationSectionService } from '@Modules/quotation-section/quotation-section.service';
import type { IQuotationDocument } from '../modules/quotation/interfaces/quotation-document.interface';

const quotationId = 'quotation-approved';
const actorId = 'updating-user';
const actorWithoutEmployeeRead = { ...authorizedUser(), id: actorId };
const actorWithEmployeeRead = {
  ...authorizedUser([PERMISSIONS.EMPLOYEES_READ]),
  id: actorId,
};
const salesAgentId = 'eligible-agent';
const transaction = mock<Transaction>();

const approvedQuotation = (
  changes: Partial<IQuotationDocument> = {},
): IQuotationDocument => ({
  ...quotationDocumentFixture([]),
  id: quotationId,
  status: QUOTATION_STATUS.APPROVED,
  version: 7,
  salesAgentId: null,
  ...changes,
});

const createService = (
  quotation: IQuotationDocument,
): {
  service: QuotationService;
  repository: jest.Mocked<QuotationRepository>;
  transactions: jest.Mocked<DatabaseTransactionService>;
  users: jest.Mocked<UserService>;
  userRoles: jest.Mocked<UserRoleService>;
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
  const users = mock<UserService>();
  const userRoles = mock<UserRoleService>();

  transactions.run.mockImplementation(async (work) => work(transaction));
  users.findById.mockResolvedValue(
    mock<IUser>({
      id: salesAgentId,
      assignedRoles: [USER_ROLES.SALES_AGENT],
      deletedAt: null,
    }),
  );
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
    users,
    userRoles,
  );
  jest.spyOn(service, 'document').mockResolvedValue(quotation);
  jest.spyOn(service, 'getById').mockResolvedValue(mock<IQuotationView>());
  return { service, repository, transactions, users, userRoles };
};

describe('eligible quotation sales agents', () => {
  test('returns active users assigned the sales-agent role', async () => {
    const { service, users, userRoles } = createService(approvedQuotation());
    userRoles.findUserIdsByRole.mockResolvedValue(['sales-agent']);
    users.findByIds.mockResolvedValue([
      mock<IUser>({
        id: 'sales-agent',
        firstName: 'Sales',
        lastName: 'Agent',
        employeeNumber: '101',
      }),
    ]);

    await expect(service.salesAgents()).resolves.toEqual([
      {
        id: 'sales-agent',
        firstName: 'Sales',
        lastName: 'Agent',
        employeeNumber: '101',
      },
    ]);
    expect(userRoles.findUserIdsByRole.mock.calls).toEqual([
      [USER_ROLES.SALES_AGENT],
    ]);
    expect(users.findByIds.mock.calls).toEqual([[['sales-agent']]]);
  });

  test('returns an empty list when no eligible role assignments exist', async () => {
    const { service, users, userRoles } = createService(approvedQuotation());
    userRoles.findUserIdsByRole.mockResolvedValue([]);
    users.findByIds.mockResolvedValue([]);

    await expect(service.salesAgents()).resolves.toEqual([]);
    expect(users.findByIds.mock.calls).toEqual([[[]]]);
  });
});

describe('approved quotation sales-agent updates', () => {
  test('rejects assignment without employee read access before looking up an ID', async () => {
    const quotation = approvedQuotation();
    const { service, repository, users } = createService(quotation);

    await expect(
      service.updateSalesAgent(
        quotationId,
        { version: quotation.version, salesAgentId },
        actorWithoutEmployeeRead,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(users.findById.mock.calls).toHaveLength(0);
    expect(repository.update.mock.calls).toHaveLength(0);
  });

  test('rejects create and save assignment without employee read access', async () => {
    const quotation = approvedQuotation();
    const { service, repository, users } = createService(quotation);

    await expect(
      service.create(
        { customerId: 'customer', salesAgentId },
        actorWithoutEmployeeRead,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.save(
        quotationId,
        mock<SaveQuotationDto>({
          version: quotation.version,
          customerId: 'customer',
          projectId: null,
          salesAgentId,
        }),
        actorWithoutEmployeeRead,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(users.findById.mock.calls).toHaveLength(0);
    expect(repository.create.mock.calls).toHaveLength(0);
    expect(repository.update.mock.calls).toHaveLength(0);
  });

  test('preserves an unchanged historical association without employee read access', async () => {
    const quotation = approvedQuotation({ salesAgentId });
    const { service, repository, users } = createService(quotation);

    await service.updateSalesAgent(
      quotationId,
      { version: quotation.version, salesAgentId },
      actorWithoutEmployeeRead,
    );

    expect(users.findById.mock.calls).toHaveLength(0);
    expect(repository.update.mock.calls[0][1]).toMatchObject({
      salesAgentId,
      updatedById: actorId,
    });
  });

  test.each([
    { existing: null, next: salesAgentId, description: 'assigns an agent' },
    {
      existing: 'previous-agent',
      next: salesAgentId,
      description: 'changes an agent',
    },
    { existing: salesAgentId, next: null, description: 'clears an agent' },
  ])(
    '$description without changing locked quotation content',
    async ({ existing, next }) => {
      const quotation = approvedQuotation({ salesAgentId: existing });
      const { service, repository, users } = createService(quotation);

      await service.updateSalesAgent(
        quotationId,
        { version: quotation.version, salesAgentId: next },
        next === null ? actorWithoutEmployeeRead : actorWithEmployeeRead,
      );

      expect(repository.update.mock.calls[0]).toEqual([
        quotationId,
        {
          salesAgentId: next,
          updatedById: actorId,
          version: quotation.version + 1,
        },
        transaction,
      ]);
      expect(users.findById.mock.calls).toHaveLength(next === null ? 0 : 1);
    },
  );

  test('rejects a stale version without updating the quotation', async () => {
    const quotation = approvedQuotation({ version: 8 });
    const { service, repository, transactions } = createService(quotation);

    await expect(
      service.updateSalesAgent(
        quotationId,
        { version: quotation.version - 1, salesAgentId },
        actorWithoutEmployeeRead,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.update.mock.calls).toHaveLength(0);
    expect(transactions.run.mock.calls).toHaveLength(1);
  });

  test('rejects an employee without a sales-agent role', async () => {
    const quotation = approvedQuotation();
    const { service, repository, transactions, users } =
      createService(quotation);
    users.findById.mockResolvedValue(
      mock<IUser>({
        id: salesAgentId,
        assignedRoles: [USER_ROLES.SECRETARY],
        deletedAt: null,
      }),
    );

    await expect(
      service.updateSalesAgent(
        quotationId,
        { version: quotation.version, salesAgentId },
        actorWithEmployeeRead,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transactions.run.mock.calls).toHaveLength(1);
    expect(repository.update.mock.calls).toHaveLength(0);
  });
});
