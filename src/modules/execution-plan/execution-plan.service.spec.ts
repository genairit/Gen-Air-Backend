import {
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';

import { PERMISSIONS } from '@Constants/authorization.constant';
import { ExecutionPlanService } from './execution-plan.service';
import type { ExecutionPlanRepository } from './execution-plan.repository';
import { EXECUTION_PLAN_STATUS } from './constants/execution-plan.constant';
import type { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import type { ProjectDriveService } from '@Modules/project-drive/project-drive.service';
import type { DatabaseTransactionService } from '@Providers/database/database-transaction.service';

const engineer = {
  id: 'engineer-id',
  permissions: [
    PERMISSIONS.EXECUTION_PLANS_SUBMIT,
    PERMISSIONS.EXECUTION_PLANS_READ,
  ],
} as IAuthorizedUser;
const lead = {
  id: 'lead-id',
  permissions: [
    PERMISSIONS.EXECUTION_PLANS_APPROVE,
    PERMISSIONS.EXECUTION_PLANS_READ,
  ],
} as IAuthorizedUser;

const setup = () => {
  const submission = {
    id: 'submission-id',
    quotationId: 'quote-id',
    projectId: 'project-id',
    driveFileId: 'file-id',
    driveFileVersion: '7',
    driveFileName: 'plan.pdf',
    planVersion: '03',
    status: EXECUTION_PLAN_STATUS.DRAFT,
    revision: 0,
    submittedById: engineer.id,
    submittedAt: null as Date | null,
    reviewedById: null as string | null,
    reviewedAt: null as Date | null,
    returnComment: null as string | null,
    checklist: [
      { key: 'indoor_btu', label: 'BTU', confirmed: false },
      { key: 'cfm_distribution', label: 'CFM', confirmed: false },
    ],
  };
  const repository = {
    quotationProjectExists: jest.fn().mockResolvedValue(true),
    latestTemplate: jest.fn().mockResolvedValue({
      version: 1,
      items: [{ key: 'indoor_btu', label: 'BTU' }],
    }),
    findById: jest.fn().mockImplementation(() => Promise.resolve(submission)),
    findLatestForQuotationProject: jest
      .fn()
      .mockImplementation(() => Promise.resolve(submission)),
    save: jest.fn().mockImplementation(() => Promise.resolve(submission)),
  };
  const drive = {
    getProjectFileVersion: jest
      .fn()
      .mockResolvedValue({ id: 'file-id', version: '7', name: 'plan.pdf' }),
  };
  const transactions = {
    run: jest
      .fn()
      .mockImplementation(
        async (work: (transaction: object) => Promise<unknown>) => work({}),
      ),
  };
  const service = new ExecutionPlanService(
    repository as unknown as ExecutionPlanRepository,
    drive as unknown as ProjectDriveService,
    transactions as unknown as DatabaseTransactionService,
  );
  return { service, repository, drive, submission };
};

describe('ExecutionPlanService review rules', () => {
  it('requires all checklist items before submitting', async () => {
    const { service, submission } = setup();
    await expect(service.submit(submission.id, 0, engineer)).rejects.toThrow(
      BadRequestException,
    );
    expect(submission.status).toBe(EXECUTION_PLAN_STATUS.DRAFT);
  });

  it('rejects a blank plan version and a ZIP plan file', async () => {
    const { service, drive } = setup();
    const input = {
      quotationId: 'quote-id',
      projectId: 'project-id',
      driveFileId: 'file-id',
      planVersion: '   ',
    };
    await expect(service.create(input, engineer)).rejects.toThrow(
      BadRequestException,
    );
    input.planVersion = '03';
    drive.getProjectFileVersion.mockResolvedValue({
      id: 'file-id',
      version: '7',
      name: 'plans.zip',
    });
    await expect(service.create(input, engineer)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('binds submission to the selected Drive version', async () => {
    const { service, drive, submission } = setup();
    submission.checklist.forEach((item) => {
      item.confirmed = true;
    });
    drive.getProjectFileVersion.mockResolvedValue({
      id: 'file-id',
      version: '8',
      name: 'plan.pdf',
    });
    await expect(service.submit(submission.id, 0, engineer)).rejects.toThrow(
      ConflictException,
    );
  });

  it('rejects self approval even with approver permission', async () => {
    const { service, submission } = setup();
    submission.status = EXECUTION_PLAN_STATUS.PENDING;
    await expect(
      service.decide(
        submission.id,
        { revision: 0, decision: 'approve' },
        {
          ...lead,
          id: engineer.id,
        },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('requires a comment when returning a plan', async () => {
    const { service, submission } = setup();
    submission.status = EXECUTION_PLAN_STATUS.PENDING;
    await expect(
      service.decide(
        submission.id,
        { revision: 0, decision: 'return', comment: ' ' },
        lead,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a stale review and preserves the pending record', async () => {
    const { service, submission } = setup();
    submission.status = EXECUTION_PLAN_STATUS.PENDING;
    submission.revision = 2;
    await expect(
      service.decide(submission.id, { revision: 1, decision: 'approve' }, lead),
    ).rejects.toThrow(ConflictException);
    expect(submission.status).toBe(EXECUTION_PLAN_STATUS.PENDING);
  });

  it('only releases an approved current file for sending', async () => {
    const { service, submission, drive, repository } = setup();
    await expect(
      service.assertApprovedForFile('quote-id', 'project-id', 'file-id'),
    ).rejects.toThrow(ConflictException);
    submission.status = EXECUTION_PLAN_STATUS.APPROVED;
    await expect(
      service.assertApprovedForFile('other-quote-id', 'project-id', 'file-id'),
    ).rejects.toThrow(ConflictException);
    await expect(
      service.assertApprovedForFile('quote-id', 'project-id', 'file-id'),
    ).resolves.toBe(submission);
    repository.findLatestForQuotationProject.mockResolvedValueOnce({
      id: 'new-revision-id',
    });
    await expect(
      service.assertApprovedForFile('quote-id', 'project-id', 'file-id'),
    ).rejects.toThrow(ConflictException);
    drive.getProjectFileVersion.mockResolvedValue({
      id: 'file-id',
      version: '8',
      name: 'plan.pdf',
    });
    await expect(
      service.assertApprovedForFile('quote-id', 'project-id', 'file-id'),
    ).rejects.toThrow(ConflictException);
  });
});
