import {
  Table,
  Model,
  Column,
  Default,
  DataType,
  BelongsTo,
  CreatedAt,
  ForeignKey,
  PrimaryKey,
} from 'sequelize-typescript';

import {
  TASK_STATUS_VALUES,
  type TaskStatusType,
} from '../constants/task-status.constant';

import {
  ITaskStatusTransition,
  TTaskStatusTransitionCreationAttributes,
} from '../interfaces/task-status-transition.interface';

import { Task } from './task.entity';
import { User } from '@Modules/user/entities/user.entity';

@Table({
  updatedAt: false,
  tableName: 'task_status_transitions',
  indexes: [
    {
      fields: ['task_id', 'created_at'],
      name: 'idx_task_status_transitions_task_created',
    },
  ],
})
export class TaskStatusTransition
  extends Model<ITaskStatusTransition, TTaskStatusTransitionCreationAttributes>
  implements ITaskStatusTransition
{
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => Task)
  @Column({ allowNull: false, type: DataType.UUID })
  declare taskId: string;

  @Column(DataType.ENUM(...TASK_STATUS_VALUES))
  declare fromStatus: TaskStatusType | null;

  @Column({ allowNull: false, type: DataType.ENUM(...TASK_STATUS_VALUES) })
  declare toStatus: TaskStatusType;

  @ForeignKey(() => User)
  @Column({ allowNull: false, type: DataType.UUID })
  declare changedById: string;

  @CreatedAt declare createdAt: Date;

  @BelongsTo(() => User, 'changedById') declare changedBy?: User;
}
