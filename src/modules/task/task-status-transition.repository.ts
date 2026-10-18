import { Transaction } from 'sequelize';
import { Injectable } from '@nestjs/common';
import { User } from '@Modules/user/entities/user.entity';
import { TaskStatusTransition } from './entities/task-status-transition.entity';
import { TTaskStatusTransitionCreationAttributes } from './interfaces/task-status-transition.interface';

@Injectable()
export class TaskStatusTransitionRepository {
  findByTask(taskId: string): Promise<TaskStatusTransition[]> {
    return TaskStatusTransition.findAll({
      where: { taskId },
      include: [{ model: User, as: 'changedBy', paranoid: false }],
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
    });
  }

  async create(
    attributes: TTaskStatusTransitionCreationAttributes,
    transaction?: Transaction,
  ): Promise<void> {
    await TaskStatusTransition.create(attributes, { transaction });
  }
}
