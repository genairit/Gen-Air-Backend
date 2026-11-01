import { Transaction } from 'sequelize';
import { Injectable } from '@nestjs/common';
import { IProject } from './interfaces/project.interface';
import { TaskRepository } from '@Modules/task/task.repository';
import { IUser } from '@Modules/user/interfaces/user.interface';
import { toProjectTaskAttributes } from './utilities/project-task.utility';
import { PROTECTED_TASK_TYPES } from '@Modules/task/constants/task-type.constant';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import { TaskStatusTransitionRepository } from '@Modules/task/task-status-transition.repository';

@Injectable()
export class ProjectTaskInitializationService {
  constructor(
    private readonly tasks: TaskRepository,
    private readonly transitions: TaskStatusTransitionRepository,
    private readonly transactions: DatabaseTransactionService,
  ) {}

  async ensureForProject(
    project: Pick<IProject, 'id' | 'name'>,
    creator: Pick<IUser, 'id'>,
    transaction: Transaction,
  ): Promise<void> {
    await this.transactions.lockKey(
      `project-mandatory-tasks:${project.id}`,
      transaction,
    );
    const existing = await this.tasks.findProtectedForProject(
      project.id,
      transaction,
    );
    const missingTypes = PROTECTED_TASK_TYPES.filter(
      (type) => !existing.some((task) => task.taskType === type),
    );
    for (const type of missingTypes) {
      const task = await this.tasks.create(
        toProjectTaskAttributes(project, creator.id, type),
        transaction,
      );
      await this.transitions.create(
        {
          taskId: task.id,
          fromStatus: null,
          toStatus: task.status,
          changedById: creator.id,
        },
        transaction,
      );
    }
  }
}
