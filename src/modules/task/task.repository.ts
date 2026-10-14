import {
  ITaskFilter,
  ITaskCountRow,
  TTaskUpdateAttributes,
  TTaskCreationAttributes,
} from './interfaces/task.interface';

import {
  toTaskCursorPage,
  buildTaskCursorWhere,
} from './utilities/task-cursor.utility';

import {
  TASK_SEARCH_COLUMNS,
  TASK_DETAIL_INCLUDES,
} from './constants/task-include.constant';

import { Injectable } from '@nestjs/common';
import { Task } from './entities/task.entity';
import { Op, Transaction, WhereOptions } from 'sequelize';
import { TASK_ORDER } from './constants/task-order.constant';
import { isTaskStatus } from './utilities/task-status.utility';
import { ICursorBatch, ICursorPage } from '@Interfaces/cursor-page.interface';
import { toContainsPattern, whereWhenPresent } from '@Utilities/query.utility';

@Injectable()
export class TaskRepository {
  findById(id: string, transaction?: Transaction): Promise<Task | null> {
    return Task.findByPk(id, {
      transaction,
      ...(transaction && { lock: transaction.LOCK.UPDATE }),
    });
  }

  findDetailedById(
    id: string,
    transaction?: Transaction,
  ): Promise<Task | null> {
    return Task.findByPk(id, { transaction, include: TASK_DETAIL_INCLUDES });
  }

  async findByFilter(
    filter: ITaskFilter,
    batch: ICursorBatch,
  ): Promise<ICursorPage<Task>> {
    const rows = await Task.findAll({
      where: {
        [Op.and]: [
          ...this.buildFilterWhere(filter),
          ...buildTaskCursorWhere(batch.batchCursor),
        ],
      },
      order: TASK_ORDER,
      include: TASK_DETAIL_INCLUDES,
      limit: batch.batchSize + 1,
    });
    return toTaskCursorPage(rows, batch.batchSize);
  }

  async countByFilter(filter: ITaskFilter): Promise<ITaskCountRow[]> {
    const rows = await Task.count({
      where: { [Op.and]: this.buildFilterWhere(filter) },
      group: ['status', 'isUrgent'],
    });
    return rows.flatMap((row) => {
      const status: unknown = row.status;
      const isUrgent: unknown = row.isUrgent;
      if (!isTaskStatus(status) || typeof isUrgent !== 'boolean') {
        return [];
      }
      return [{ status, isUrgent, count: Number(row.count) }];
    });
  }

  create(
    attributes: TTaskCreationAttributes,
    transaction?: Transaction,
  ): Promise<Task> {
    return Task.create(attributes, { transaction });
  }

  async update(
    id: string,
    attributes: TTaskUpdateAttributes,
    transaction?: Transaction,
  ): Promise<void> {
    await Task.update(attributes, { where: { id }, transaction });
  }

  async softDelete(id: string, transaction?: Transaction): Promise<void> {
    await Task.destroy({ where: { id }, transaction });
  }

  private buildFilterWhere(filter: ITaskFilter): WhereOptions<Task>[] {
    return [
      ...whereWhenPresent(filter.search, (search) =>
        this.buildSearchWhere(search),
      ),
      ...whereWhenPresent(filter.unassigned, (unassigned) => ({
        assigneeId: unassigned ? { [Op.is]: null } : { [Op.ne]: null },
      })),
      ...whereWhenPresent(filter.assigneeId, (assigneeId) => ({ assigneeId })),
      ...whereWhenPresent(filter.projectId, (projectId) => ({ projectId })),
      ...whereWhenPresent(filter.customerId, (customerId) => ({ customerId })),
      ...whereWhenPresent(filter.status, (status) => ({ status })),
      ...whereWhenPresent(filter.isUrgent, (isUrgent) => ({ isUrgent })),
    ];
  }

  private buildSearchWhere(search: string): WhereOptions<Task> {
    const pattern = toContainsPattern(search);

    return {
      [Op.or]: TASK_SEARCH_COLUMNS.map((column) => ({
        [column]: { [Op.iLike]: pattern },
      })),
    };
  }
}
