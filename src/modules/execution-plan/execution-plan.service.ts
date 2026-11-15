import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';

import {
  CreateExecutionPlanDto,
  DecideExecutionPlanDto,
} from './dto/execution-plan.dto';

import {
  hasPermission,
  assertPermissions,
} from '@Utilities/permission.utility';

import {
  EXECUTION_PLAN_STATUS,
  EXECUTION_PLAN_DECISION,
} from './constants/execution-plan.constant';

import { UniqueConstraintError } from 'sequelize';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { ExecutionPlanRepository } from './execution-plan.repository';
import type { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import { ProjectDriveService } from '@Modules/project-drive/project-drive.service';
import { ExecutionPlanSubmission } from './entities/execution-plan-submission.entity';
import type { IExecutionPlanChecklistItem } from './interfaces/execution-plan.interface';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';

@Injectable()
export class ExecutionPlanService {
  constructor(
    private readonly repository: ExecutionPlanRepository,
    private readonly drive: ProjectDriveService,
    private readonly transactions: DatabaseTransactionService,
  ) {}

  async latestTemplate() {
    const template = await this.repository.latestTemplate();
    if (!template) {
      throw new NotFoundException(
        'Execution plan checklist template is missing',
      );
    }
    return template;
  }

  async create(input: CreateExecutionPlanDto, actor: IAuthorizedUser) {
    assertPermissions(actor, PERMISSIONS.EXECUTION_PLANS_SUBMIT);
    const linked = await this.repository.quotationProjectExists(
      input.quotationId,
      input.projectId,
    );
    if (!linked) {
      throw new BadRequestException('Quotation is not linked to this project');
    }
    const [template, file] = await Promise.all([
      this.latestTemplate(),
      this.drive.getProjectFileVersion(input.projectId, input.driveFileId),
    ]);
    if (/\.zip$/i.test(file.name)) {
      throw new BadRequestException(
        'Select a plan file rather than a ZIP archive',
      );
    }
    if (!input.planVersion.trim()) {
      throw new BadRequestException('Plan version is required');
    }
    const latest = await this.repository.findLatestForQuotationProject(
      input.quotationId,
      input.projectId,
    );
    const supersedes = input.supersedesId
      ? await this.repository.findById(input.supersedesId)
      : latest;
    if (input.supersedesId && !supersedes) {
      throw new NotFoundException('Previous plan submission was not found');
    }
    if (latest && supersedes?.id !== latest.id) {
      throw new ConflictException('A newer plan submission already exists');
    }
    if (
      supersedes &&
      (supersedes.quotationId !== input.quotationId ||
        supersedes.projectId !== input.projectId ||
        (supersedes.status !== EXECUTION_PLAN_STATUS.RETURNED &&
          supersedes.status !== EXECUTION_PLAN_STATUS.APPROVED &&
          supersedes.status !== EXECUTION_PLAN_STATUS.CANCELLED))
    ) {
      throw new ConflictException(
        'Previous plan is not eligible for a revision',
      );
    }
    if (
      supersedes &&
      supersedes.driveFileId === file.id &&
      supersedes.driveFileVersion === file.version
    ) {
      throw new ConflictException('Choose a revised plan file or version');
    }
    const checklist: IExecutionPlanChecklistItem[] = template.items.map(
      (item) => ({ ...item, confirmed: false }),
    );
    try {
      return await this.transactions.run((transaction) =>
        this.repository.create(
          {
            quotationId: input.quotationId,
            projectId: input.projectId,
            driveFileId: file.id,
            driveFileVersion: file.version,
            driveFileName: file.name,
            planVersion: input.planVersion.trim(),
            templateVersion: template.version,
            checklist,
            status: EXECUTION_PLAN_STATUS.DRAFT,
            revision: 0,
            submittedById: actor.id,
            submittedAt: null,
            reviewedById: null,
            reviewedAt: null,
            returnComment: null,
            supersedesId: supersedes?.id ?? null,
          },
          transaction,
        ),
      );
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new ConflictException(
          'A plan is already being prepared or reviewed',
        );
      }
      throw error;
    }
  }

  async getById(id: string, actor: IAuthorizedUser) {
    const submission = await this.requireById(id);
    this.assertCanRead(submission, actor);
    return submission;
  }

  ownDraftForFile(projectId: string, fileId: string, actor: IAuthorizedUser) {
    assertPermissions(actor, PERMISSIONS.EXECUTION_PLANS_SUBMIT);
    return this.repository.findOwnDraftForFile(projectId, fileId, actor.id);
  }

  async forQuotation(quotationId: string, actor: IAuthorizedUser) {
    const submissions = await this.repository.findForQuotation(quotationId);
    return hasPermission(actor, PERMISSIONS.EXECUTION_PLANS_APPROVE)
      ? submissions
      : submissions.filter((item) => item.submittedById === actor.id);
  }

  pending(actor: IAuthorizedUser) {
    assertPermissions(actor, PERMISSIONS.EXECUTION_PLANS_APPROVE);
    return this.repository.findPending();
  }

  async updateChecklist(
    id: string,
    revision: number,
    confirmedKeys: string[],
    actor: IAuthorizedUser,
  ) {
    return this.transactions.run(async (transaction) => {
      const submission = await this.requireById(id, transaction);
      this.assertOwnerDraft(submission, revision, actor);
      const allowedKeys = new Set(submission.checklist.map((item) => item.key));
      if (confirmedKeys.some((key) => !allowedKeys.has(key))) {
        throw new BadRequestException('Unknown checklist item');
      }
      const selected = new Set(confirmedKeys);
      submission.checklist = submission.checklist.map((item) => ({
        ...item,
        confirmed: selected.has(item.key),
      }));
      submission.revision += 1;
      return this.repository.save(submission, transaction);
    });
  }

  async submit(id: string, revision: number, actor: IAuthorizedUser) {
    const snapshot = await this.requireById(id);
    await this.assertFileVersion(snapshot);
    return this.transactions.run(async (transaction) => {
      const submission = await this.requireById(id, transaction);
      this.assertOwnerDraft(submission, revision, actor);
      if (!submission.checklist.every((item) => item.confirmed)) {
        throw new BadRequestException('Complete every plan checklist item');
      }
      submission.status = EXECUTION_PLAN_STATUS.PENDING;
      submission.submittedAt = new Date();
      submission.revision += 1;
      return this.repository.save(submission, transaction);
    });
  }

  async decide(
    id: string,
    input: DecideExecutionPlanDto,
    actor: IAuthorizedUser,
  ) {
    assertPermissions(actor, PERMISSIONS.EXECUTION_PLANS_APPROVE);
    const snapshot = await this.requireById(id);
    await this.assertFileVersion(snapshot);
    return this.transactions.run(async (transaction) => {
      const submission = await this.requireById(id, transaction);
      this.assertRevision(submission, input.revision);
      if (submission.status !== EXECUTION_PLAN_STATUS.PENDING) {
        throw new ConflictException('Plan is no longer pending review');
      }
      if (submission.submittedById === actor.id) {
        throw new ForbiddenException('You cannot approve your own plan');
      }
      const comment = input.comment?.trim() ?? '';
      if (input.decision === EXECUTION_PLAN_DECISION.RETURN && !comment) {
        throw new BadRequestException('A return comment is required');
      }
      submission.status =
        input.decision === EXECUTION_PLAN_DECISION.APPROVE
          ? EXECUTION_PLAN_STATUS.APPROVED
          : EXECUTION_PLAN_STATUS.RETURNED;
      submission.returnComment =
        input.decision === EXECUTION_PLAN_DECISION.RETURN ? comment : null;
      submission.reviewedById = actor.id;
      submission.reviewedAt = new Date();
      submission.revision += 1;
      return this.repository.save(submission, transaction);
    });
  }

  async cancel(id: string, revision: number, actor: IAuthorizedUser) {
    return this.transactions.run(async (transaction) => {
      const submission = await this.requireById(id, transaction);
      this.assertRevision(submission, revision);
      if (submission.submittedById !== actor.id) {
        throw new ForbiddenException('Only the submitter can cancel this plan');
      }
      if (
        submission.status !== EXECUTION_PLAN_STATUS.DRAFT &&
        submission.status !== EXECUTION_PLAN_STATUS.PENDING
      ) {
        throw new ConflictException('Plan can no longer be cancelled');
      }
      submission.status = EXECUTION_PLAN_STATUS.CANCELLED;
      submission.revision += 1;
      return this.repository.save(submission, transaction);
    });
  }

  async assertApprovedForFile(
    quotationId: string,
    projectId: string,
    driveFileId: string,
  ) {
    const submission = await this.repository.findLatestForQuotationProject(
      quotationId,
      projectId,
    );
    if (
      !submission ||
      submission.quotationId !== quotationId ||
      submission.driveFileId !== driveFileId ||
      submission.status !== EXECUTION_PLAN_STATUS.APPROVED
    ) {
      throw new ConflictException('This execution plan has not been approved');
    }
    if (
      !(await this.repository.quotationProjectExists(quotationId, projectId))
    ) {
      throw new ConflictException(
        'Quotation is no longer linked to this project',
      );
    }
    await this.assertFileVersion(submission);
    return submission;
  }

  private async assertFileVersion(
    submission: ExecutionPlanSubmission,
  ): Promise<void> {
    const file = await this.drive.getProjectFileVersion(
      submission.projectId,
      submission.driveFileId,
    );
    if (file.version !== submission.driveFileVersion) {
      throw new ConflictException(
        'The plan file has changed; submit the new version',
      );
    }
  }

  private assertOwnerDraft(
    submission: ExecutionPlanSubmission,
    revision: number,
    actor: IAuthorizedUser,
  ): void {
    this.assertRevision(submission, revision);
    if (submission.submittedById !== actor.id) {
      throw new ForbiddenException('Only the submitter can edit the checklist');
    }
    if (submission.status !== EXECUTION_PLAN_STATUS.DRAFT) {
      throw new ConflictException('Checklist is no longer editable');
    }
  }

  private assertRevision(
    submission: ExecutionPlanSubmission,
    revision: number,
  ): void {
    if (submission.revision !== revision) {
      throw new ConflictException('Plan changed; reload before continuing');
    }
  }

  private assertCanRead(
    submission: ExecutionPlanSubmission,
    actor: IAuthorizedUser,
  ): void {
    if (
      !hasPermission(actor, PERMISSIONS.EXECUTION_PLANS_APPROVE) &&
      submission.submittedById !== actor.id
    ) {
      throw new ForbiddenException('Plan is not available to this user');
    }
  }

  private async requireById(
    id: string,
    transaction?: Parameters<ExecutionPlanRepository['findById']>[1],
  ) {
    const submission = await this.repository.findById(id, transaction);
    if (!submission) {
      throw new NotFoundException('Execution plan submission was not found');
    }
    return submission;
  }
}
