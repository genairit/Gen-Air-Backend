import { Transaction } from 'sequelize';
import { Injectable } from '@nestjs/common';
import { User } from '@Modules/user/entities/user.entity';
import { Project } from '@Modules/project/entities/project.entity';
import { Quotation } from '@Modules/quotation/entities/quotation.entity';
import { EXECUTION_PLAN_STATUS } from './constants/execution-plan.constant';
import { ExecutionPlanTemplate } from './entities/execution-plan-template.entity';
import type { TExecutionPlanCreation } from './interfaces/execution-plan.interface';
import { ExecutionPlanSubmission } from './entities/execution-plan-submission.entity';
import { QuotationProject } from '@Modules/quotation-project/entities/quotation-project.entity';

@Injectable()
export class ExecutionPlanRepository {
  latestTemplate(): Promise<ExecutionPlanTemplate | null> {
    return ExecutionPlanTemplate.findOne({ order: [['version', 'DESC']] });
  }

  quotationProjectExists(
    quotationId: string,
    projectId: string,
  ): Promise<boolean> {
    return QuotationProject.findOne({ where: { quotationId, projectId } }).then(
      (record) => record !== null,
    );
  }

  findById(
    id: string,
    transaction?: Transaction,
  ): Promise<ExecutionPlanSubmission | null> {
    return ExecutionPlanSubmission.findByPk(id, {
      transaction,
      ...(transaction && { lock: transaction.LOCK.UPDATE }),
    });
  }

  findForQuotation(quotationId: string): Promise<ExecutionPlanSubmission[]> {
    return ExecutionPlanSubmission.findAll({
      where: { quotationId },
      include: [
        {
          model: Project,
          attributes: ['id', 'name', 'code', 'parentProjectId'],
        },
        {
          model: User,
          as: 'submitter',
          attributes: ['id', 'firstName', 'lastName'],
        },
        {
          model: User,
          as: 'reviewer',
          attributes: ['id', 'firstName', 'lastName'],
        },
      ],
      order: [['createdAt', 'DESC']],
    });
  }

  findPending(): Promise<{ rows: ExecutionPlanSubmission[]; count: number }> {
    return ExecutionPlanSubmission.findAndCountAll({
      where: { status: EXECUTION_PLAN_STATUS.PENDING },
      include: [
        { model: Quotation, attributes: ['id', 'number'] },
        {
          model: Project,
          attributes: ['id', 'name', 'code', 'parentProjectId'],
        },
        {
          model: User,
          as: 'submitter',
          attributes: ['id', 'firstName', 'lastName'],
        },
      ],
      order: [
        ['submittedAt', 'DESC'],
        ['id', 'DESC'],
      ],
    });
  }

  findOwnDraftForFile(
    projectId: string,
    driveFileId: string,
    submittedById: string,
  ): Promise<ExecutionPlanSubmission | null> {
    return ExecutionPlanSubmission.findOne({
      where: {
        projectId,
        driveFileId,
        submittedById,
        status: EXECUTION_PLAN_STATUS.DRAFT,
      },
      order: [['createdAt', 'DESC']],
    });
  }

  findLatestForQuotationProject(
    quotationId: string,
    projectId: string,
  ): Promise<ExecutionPlanSubmission | null> {
    return ExecutionPlanSubmission.findOne({
      where: { quotationId, projectId },
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
    });
  }

  create(
    values: TExecutionPlanCreation,
    transaction: Transaction,
  ): Promise<ExecutionPlanSubmission> {
    return ExecutionPlanSubmission.create(values, { transaction });
  }

  async save(
    submission: ExecutionPlanSubmission,
    transaction: Transaction,
  ): Promise<ExecutionPlanSubmission> {
    return submission.save({ transaction });
  }
}
