import {
  Inject,
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import {
  hasPermission,
  assertPermissions,
} from '@Utilities/permission.utility';

import {
  ITaskContext,
  IQuotationTaskLink,
  ITaskQuotationSummary,
} from './interfaces/task-quotation.interface';

import { Sequelize } from 'sequelize-typescript';
import { QueryTypes, Transaction } from 'sequelize';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { ProviderNames } from '@Providers/database/provider-names';
import { HTTP_ERROR_CODES } from '@Constants/http-error-code.constant';
import { TASK_TYPES } from '@Modules/task/constants/task-type.constant';
import { IAuthorizedUser } from '@Interfaces/authorized-user.interface';

@Injectable()
export class TaskQuotationLinksService {
  constructor(
    @Inject(ProviderNames.SEQUELIZE) private readonly database: Sequelize,
  ) {}

  async context(
    taskId: string,
    transaction?: Transaction,
  ): Promise<ITaskContext> {
    if (transaction) {
      const [task] = await this.database.query(
        'SELECT id FROM tasks WHERE id=$taskId AND deleted_at IS NULL FOR UPDATE',
        { bind: { taskId }, transaction, type: QueryTypes.SELECT },
      );
      if (!task) {
        throw new NotFoundException('Task was not found');
      }
    }
    if (transaction) {
      await this.database.query(
        'SELECT p.id FROM projects p JOIN tasks t ON t.project_id=p.id WHERE t.id=$taskId FOR SHARE OF p',
        { bind: { taskId }, transaction, type: QueryTypes.SELECT },
      );
    }
    const [task] = await this.database.query<ITaskContext>(
      `SELECT t.id,t.title,t.task_type AS "taskType",t.project_id AS "projectId", CASE WHEN t.project_id IS NULL THEN c.id WHEN t.customer_id IS NOT NULL AND t.customer_id IS DISTINCT FROM pc.id THEN NULL ELSE pc.id END AS "customerId" FROM tasks t LEFT JOIN projects p ON p.id=t.project_id AND p.deleted_at IS NULL LEFT JOIN customers pc ON pc.id=p.customer_id AND pc.deleted_at IS NULL LEFT JOIN customers c ON c.id=t.customer_id AND c.deleted_at IS NULL WHERE t.id=$taskId AND t.deleted_at IS NULL`,
      { bind: { taskId }, transaction, type: QueryTypes.SELECT },
    );
    if (!task) {
      throw new NotFoundException('Task was not found');
    }
    return task;
  }
  async list(
    taskId: string,
    transaction?: Transaction,
  ): Promise<ITaskQuotationSummary[]> {
    return this.database.query<ITaskQuotationSummary>(
      `SELECT q.id,q.number,q.status,l.is_primary AS "isPrimary" FROM task_quotation_links l JOIN quotations q ON q.id=l.quotation_id AND q.deleted_at IS NULL WHERE l.task_id=$taskId ORDER BY l.is_primary DESC,l.created_at,l.quotation_id`,
      { bind: { taskId }, transaction, type: QueryTypes.SELECT },
    );
  }
  unavailableReason(
    task: ITaskContext,
  ): 'WRONG_TASK_TYPE' | 'MISSING_CONTEXT' | null {
    if (task.taskType !== TASK_TYPES.QUOTATION) {
      return 'WRONG_TASK_TYPE';
    }
    return task.customerId ? null : 'MISSING_CONTEXT';
  }
  assertContextPermissions(task: ITaskContext, actor: IAuthorizedUser): void {
    assertPermissions(
      actor,
      PERMISSIONS.TASKS_READ,
      PERMISSIONS.QUOTATIONS_READ,
      PERMISSIONS.CUSTOMERS_READ,
    );
    if (task.projectId) {
      assertPermissions(actor, PERMISSIONS.PROJECTS_READ);
    }
  }
  async read(taskId: string, actor: IAuthorizedUser) {
    assertPermissions(
      actor,
      PERMISSIONS.TASKS_READ,
      PERMISSIONS.QUOTATIONS_READ,
    );
    const task = await this.context(taskId);
    const quotations = await this.list(taskId);
    const unavailableReason = this.unavailableReason(task);
    const canReadCustomer = hasPermission(actor, PERMISSIONS.CUSTOMERS_READ);
    const canReadProject =
      !task.projectId || hasPermission(actor, PERMISSIONS.PROJECTS_READ);
    return {
      customerId: canReadCustomer ? task.customerId : null,
      projectId: canReadProject ? task.projectId : null,
      unavailableReason,
      canCreate:
        !unavailableReason &&
        canReadCustomer &&
        canReadProject &&
        hasPermission(actor, PERMISSIONS.QUOTATIONS_CREATE),
      primaryQuotationId:
        quotations.find((row) => row.isPrimary)?.id ??
        quotations[0]?.id ??
        null,
      quotations,
    };
  }
  async attachPrimary(
    taskId: string,
    quotationId: string,
    transaction: Transaction,
  ): Promise<void> {
    await this.database.query(
      'UPDATE task_quotation_links SET is_primary=false WHERE task_id=$taskId AND is_primary=true',
      { bind: { taskId }, transaction },
    );
    await this.database.query(
      'INSERT INTO task_quotation_links(task_id,quotation_id,is_primary) VALUES ($taskId,$quotationId,true) ON CONFLICT(task_id,quotation_id) DO UPDATE SET is_primary=true',
      { bind: { taskId, quotationId }, transaction },
    );
  }
  async copy(
    sourceId: string,
    quotationId: string,
    transaction: Transaction,
  ): Promise<void> {
    await this.database.query(
      'INSERT INTO task_quotation_links(task_id,quotation_id,is_primary) SELECT task_id,$quotationId,false FROM task_quotation_links WHERE quotation_id=$sourceId ON CONFLICT DO NOTHING',
      { bind: { sourceId, quotationId }, transaction },
    );
  }
  async assertQuotationContext(
    quotationId: string,
    customerId: string,
    projectId: string | null,
    transaction: Transaction,
  ): Promise<void> {
    const rows = await this.database.query<{
      customerId: string | null;
      projectId: string | null;
    }>(
      `SELECT CASE WHEN t.project_id IS NULL THEN t.customer_id ELSE p.customer_id END AS "customerId",t.project_id AS "projectId" FROM task_quotation_links l JOIN tasks t ON t.id=l.task_id LEFT JOIN projects p ON p.id=t.project_id WHERE l.quotation_id=$quotationId`,
      { bind: { quotationId }, transaction, type: QueryTypes.SELECT },
    );
    if (
      rows.some(
        (row) =>
          row.customerId !== customerId ||
          (row.projectId !== null && row.projectId !== projectId),
      )
    ) {
      throw new ConflictException({
        code: HTTP_ERROR_CODES.TASK_QUOTATION_CONTEXT_LOCKED,
        message: 'Linked task quotation context cannot change',
      });
    }
  }
  async metadata(quotationId: string, actor: IAuthorizedUser) {
    const rows = await this.database.query<
      IQuotationTaskLink & {
        projectId: string | null;
        deletedAt: string | null;
      }
    >(
      `SELECT t.id AS "taskId",t.title,t.project_id AS "projectId",t.deleted_at AS "deletedAt",l.is_primary AS "isPrimary" FROM task_quotation_links l JOIN tasks t ON t.id=l.task_id WHERE l.quotation_id=$quotationId ORDER BY t.id`,
      { bind: { quotationId }, type: QueryTypes.SELECT },
    );
    return {
      taskContextLocked: rows.length > 0,
      taskProjectLocked: rows.some((row) => row.projectId !== null),
      taskLinks: hasPermission(actor, PERMISSIONS.TASKS_READ)
        ? rows
            .filter((row) => row.deletedAt === null)
            .map(({ projectId, deletedAt, ...row }) => {
              void deletedAt;
              void projectId;
              return row;
            })
        : [],
    };
  }
  assertAvailable(task: ITaskContext): void {
    const reason = this.unavailableReason(task);
    if (reason) {
      throw new BadRequestException({
        code: HTTP_ERROR_CODES.TASK_QUOTATION_CONTEXT_UNAVAILABLE,
        message: 'Task quotation context is unavailable',
      });
    }
  }
}
