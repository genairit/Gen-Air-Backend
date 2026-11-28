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
import { PERMISSIONS } from '@Constants/authorization.constant';
import { QUOTATION_STATUS } from './constants/quotation.constant';
import type { QuotationRepository } from './quotation.repository';
import type { ProjectService } from '@Modules/project/project.service';
import type { CustomerService } from '@Modules/customer/customer.service';
import { quotationDocumentFixture } from '../../testing/quotation.fixture';
import type { UserRoleService } from '@Modules/user-role/user-role.service';
import type { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import type { QuotationSelectionService } from './quotation-selection.service';
import type { IQuotationDetailView } from './interfaces/quotation-document.interface';
import { QUOTATION_LIFECYCLE_ACTION } from './constants/quotation-lifecycle.constant';
import { PublicationService } from '@Modules/quotation-publication/publication.service';
import type { QuotationRuleService } from '@Modules/quotation-rule/quotation-rule.service';
import type { QuotationItemService } from '@Modules/quotation-item/quotation-item.service';
import type { CatalogueItemService } from '@Modules/catalogue-item/catalogue-item.service';
import { TaskQuotationLinksService } from '@Modules/quotation/task-quotation-links.service';
import type { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import type { QuotationSectionService } from '@Modules/quotation-section/quotation-section.service';
import type { QuotationProjectService } from '@Modules/quotation-project/quotation-project.service';

interface IRejectionTestContext {
  actor: IAuthorizedUser;
  service: QuotationService;
  quotation: ReturnType<typeof quotationDocumentFixture>;
  repository: ReturnType<typeof mock<QuotationRepository>>;
}

const setup = (): IRejectionTestContext => {
  const quotation = quotationDocumentFixture([]);
  const projects = mock<ProjectService>();
  projects.quotationContext.mockResolvedValue({
    id: quotation.projectId!,
    customerId: quotation.customerId,
  });
  const repository = mock<QuotationRepository>();
  const transactions = mock<DatabaseTransactionService>();
  const rules = mock<QuotationRuleService>();
  const catalogue = mock<CatalogueItemService>();
  rules.configuration.mockResolvedValue({
    rules: quotation.ruleConfiguration,
    fingerprint: quotation.ruleConfigFingerprint,
  });
  catalogue.getByIds.mockResolvedValue([]);
  const service = new QuotationService(
    repository,
    rules,
    mock<QuotationSectionService>(),
    mock<QuotationItemService>(),
    catalogue,
    mock<QuotationSelectionService>(),
    mock<CustomerService>(),
    projects,
    mock<QuotationProjectService>(),
    transactions,
    mock<UserService>(),
    mock<UserRoleService>(),
    mock<TaskQuotationLinksService>(),
    mock<PublicationService>(),
  );
  const transaction = mock<Transaction>();
  transactions.run.mockImplementation((work): ReturnType<typeof work> =>
    work(transaction),
  );
  jest.spyOn(service, 'document').mockResolvedValue(quotation);
  jest
    .spyOn(service, 'getById')
    .mockResolvedValue(mock<IQuotationDetailView>({ id: quotation.id }));
  const actor = mock<IAuthorizedUser>({
    id: randomUUID(),
    firstName: 'Lead',
    lastName: 'Engineer',
    assignedRoles: [USER_ROLES.ENGINEERING_LEAD],
    permissions: [PERMISSIONS.QUOTATIONS_APPROVE],
  });
  return { service, repository, quotation, actor };
};

describe('quotation rejection and resubmission', (): void => {
  it('requires an admin or engineering lead and a review quotation', async (): Promise<void> => {
    const { service, quotation, actor, repository } = setup();
    quotation.status = QUOTATION_STATUS.REVIEW;
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
    quotation.status = QUOTATION_STATUS.DRAFT;
    await expect(
      service.reject(
        quotation.id,
        { version: quotation.version, reason: 'Fix totals' },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.update.mock.calls).toHaveLength(0);
  });

  it('returns a review quotation to editable draft with the reason and actor', async (): Promise<void> => {
    const { service, quotation, actor, repository } = setup();
    quotation.status = QUOTATION_STATUS.REVIEW;
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

  it('resubmits a corrected draft and closes its pending rejection', async (): Promise<void> => {
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

  it('rejects stale revisions', async (): Promise<void> => {
    const { service, quotation, actor } = setup();
    quotation.status = QUOTATION_STATUS.REVIEW;
    await expect(
      service.reject(
        quotation.id,
        { version: quotation.version + 1, reason: 'Fix totals' },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns review without fabricating a rejection and preserves approval evidence', async (): Promise<void> => {
    const { service, quotation, actor, repository } = setup();
    quotation.status = QUOTATION_STATUS.REVIEW;
    quotation.approvedById = actor.id;
    quotation.approvedAt = new Date('2026-11-01T00:00:00Z');
    quotation.acknowledgedWarnings = ['old-warning'];
    await service.transition(
      quotation.id,
      { version: quotation.version, status: QUOTATION_STATUS.DRAFT },
      actor,
    );
    expect(repository.update.mock.calls[0]?.[1]).toMatchObject({
      status: QUOTATION_STATUS.DRAFT,
      approvedAt: null,
      approvedById: null,
      acknowledgedWarnings: [],
    });
    expect(repository.update.mock.calls[0]?.[1]).not.toHaveProperty(
      'rejectionHistory',
    );
    expect(repository.appendLifecycleEvent.mock.calls[0]?.[0]).toMatchObject({
      action: QUOTATION_LIFECYCLE_ACTION.RETURN,
      fromStatus: QUOTATION_STATUS.REVIEW,
      toStatus: QUOTATION_STATUS.DRAFT,
      actorId: actor.id,
      reason: null,
      evidence: {
        approvedById: actor.id,
        approvedAt: quotation.approvedAt,
        acknowledgedWarnings: ['old-warning'],
      },
    });
  });
  it('denies review return to an ordinary engineer while preserving approved return policy', async (): Promise<void> => {
    const { service, quotation, actor, repository } = setup();
    quotation.status = QUOTATION_STATUS.REVIEW;
    const engineer = { ...actor, assignedRoles: [USER_ROLES.ENGINEER] };
    await expect(
      service.transition(
        quotation.id,
        { version: quotation.version, status: QUOTATION_STATUS.DRAFT },
        engineer,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.appendLifecycleEvent.mock.calls).toHaveLength(0);
    quotation.status = QUOTATION_STATUS.APPROVED;
    await service.transition(
      quotation.id,
      { version: quotation.version, status: QUOTATION_STATUS.DRAFT },
      engineer,
    );
    expect(repository.appendLifecycleEvent.mock.calls).toHaveLength(1);
  });
});
