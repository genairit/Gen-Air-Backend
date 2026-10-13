import {
  ITaskFilter,
  TTaskUpdateAttributes,
  TTaskCreationAttributes,
} from './interfaces/task.interface';

import {
  CURSOR_ORDER,
  toCursorPage,
  buildCursorWhere,
} from '@Utilities/cursor-pagination.utility';

import { Injectable } from '@nestjs/common';
import { Task } from './entities/task.entity';
import { Op, Transaction, WhereOptions } from 'sequelize';
import { whereWhenPresent } from '@Utilities/query.utility';
import { ICursorBatch, ICursorPage } from '@Interfaces/cursor-page.interface';

@Injectable()
export class TaskRepository {
  findById(id: string, transaction?: Transaction): Promise<Task | null> {
    return Task.findByPk(id, {
      transaction,
      ...(transaction && { lock: transaction.LOCK.UPDATE }),
    });
  }
  async findByFilter(
    filter: ITaskFilter,
    batch: ICursorBatch,
  ): Promise<ICursorPage<Task>> {
    const rows = await Task.findAll({
      where: {
        [Op.and]: [
          ...this.buildFilterWhere(filter),
          ...buildCursorWhere(batch.batchCursor),
        ],
      },
      order: CURSOR_ORDER,
      limit: batch.batchSize + 1,
    });
    return toCursorPage(rows, batch.batchSize);
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
      ...whereWhenPresent(filter.assigneeId, (assigneeId) => ({ assigneeId })),
      ...whereWhenPresent(filter.projectId, (projectId) => ({ projectId })),
      ...whereWhenPresent(filter.customerId, (customerId) => ({ customerId })),
      ...whereWhenPresent(filter.status, (status) => ({ status })),
      ...whereWhenPresent(filter.isUrgent, (isUrgent) => ({ isUrgent })),
    ];
  }
}
