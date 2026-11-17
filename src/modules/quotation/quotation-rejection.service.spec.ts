import {
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';

import { randomUUID } from 'node:crypto';
import { mock } from 'jest-mock-extended';
import type { Transaction } from 'sequelize';
import { QuotationService } from './quotation.service';
import { USER_ROLES } from '@Constants/user-role.constant';
import type { UserService } from '@Modules/user/user.service';
import type { QuotationRepository } from './quotation.repository';
import type { ProjectService } from '@Modules/project/project.service';
import type { CustomerService } from '@Modules/customer/customer.service';
import { quotationDocumentFixture } from '../../testing/quotation.fixture';
import type { UserRoleService } from '@Modules/user-role/user-role.service';
import type { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import type { QuotationSelectionService } from './quotation-selection.service';
import type { QuotationRuleService } from '@Modules/quotation-rule/quotation-rule.service';
import type { QuotationItemService } from '@Modules/quotation-item/quotation-item.service';
import type { CatalogueItemService } from '@Modules/catalogue-item/catalogue-item.service';
import type { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import type { QuotationSectionService } from '@Modules/quotation-section/quotation-section.service';
import type { QuotationProjectService } from '@Modules/quotation-project/quotation-project.service';

const setup = () => {
  const quotation = quotationDocumentFixture([]);
  const repository = mock<QuotationRepository>();
  const transactions = mock<DatabaseTransactionService>();
  const service = new QuotationService(
    repository,
    mock<QuotationRuleService>(),
    mock<QuotationSectionService>(),
    mock<QuotationItemService>(),
    mock<CatalogueItemService>(),
    mock<QuotationSelectionService>(),
    mock<CustomerService>(),
    mock<ProjectService>(),
    mock<QuotationProjectService>(),
    transactions,
    mock<UserService>(),
    mock<UserRoleService>(),
  );
  const transaction = mock<Transaction>();
  transactions.run.mockImplementation((work) => work(transaction));
  jest.spyOn(service, 'document').mockResolvedValue(quotation);
  jest.spyOn(service, 'getById').mockResolvedValue(mock({ id: quotation.id }));
  const actor = mock<IAuthorizedUser>({
    id: randomUUID(),
    firstName: 'Lead',
    lastName: 'Engineer',
    assignedRoles: [USER_ROLES.ENGINEERING_LEAD],
  });
  return { service, repository, quotation, actor };
};

describe('quotation rejection and resubmission', () => {
  it('requires an admin or engineering lead and a review quotation', async () => {
    const { service, quotation, actor, repository } = setup();
    quotation.status = 'review';
    await expect(
      service.reject(
        quotation.id,
        { version: quotation.version, reason: 'Fix totals' },
        {
          ...actor,
          assignedRoles: [USER_ROLES.ENGINEER],
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.reject(
        quotation.id,
        { version: quotation.version, reason: '  ' },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    quotation.status = 'draft';
    await expect(
      service.reject(
        quotation.id,
        { version: quotation.version, reason: 'Fix totals' },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('returns a review quotation to editable draft with the reason and actor', async () => {
    const { service, quotation, actor, repository } = setup();
    quotation.status = 'review';
    await service.reject(
      quotation.id,
      { version: quotation.version, reason: '  Fix totals  ' },
      actor,
    );
    expect(repository.update.mock.calls[0][1]).toMatchObject({
      status: 'draft',
      version: quotation.version + 1,
      rejectionHistory: [
        expect.objectContaining({
          reason: 'Fix totals',
          rejectedById: actor.id,
          resubmittedAt: null,
        }),
      ],
    });
  });

  it('resubmits a corrected draft and closes its pending rejection', async () => {
    const { service, quotation, actor, repository } = setup();
    quotation.rejectionHistory = [
      {
        reason: 'Fix totals',
        rejectedAt: new Date().toISOString(),
        rejectedById: actor.id,
        rejectedByName: 'Lead Engineer',
        resubmittedAt: null,
        resubmittedById: null,
      },
    ];
    quotation.sections[0].items = [mock()];
    await service.resubmit(quotation.id, { version: quotation.version }, actor);
    expect(repository.update.mock.calls[0][1]).toMatchObject({
      status: 'review',
      rejectionHistory: [
        expect.objectContaining({ resubmittedById: actor.id }),
      ],
    });
    quotation.sections[0].items = [];
    await expect(
      service.resubmit(quotation.id, { version: quotation.version }, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects stale revisions', async () => {
    const { service, quotation, actor } = setup();
    quotation.status = 'review';
    await expect(
      service.reject(
        quotation.id,
        { version: quotation.version + 1, reason: 'Fix totals' },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not allow a review quotation to return to draft without a reason', async () => {
    const { service, quotation, actor } = setup();
    quotation.status = 'review';
    await expect(
      service.transition(
        quotation.id,
        { version: quotation.version, status: 'draft' },
        actor.id,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
