import {
  Table,
  Model,
  Column,
  Default,
  DataType,
  BelongsTo,
  CreatedAt,
  DeletedAt,
  UpdatedAt,
  ForeignKey,
  PrimaryKey,
} from 'sequelize-typescript';

import {
  TASK_TYPES,
  TASK_TYPE_VALUES,
  PROTECTED_TASK_TYPES,
  TASK_STORED_TITLE_LENGTH,
} from '../constants/task-type.constant';

import {
  TASK_STATUSES,
  TASK_STATUS_VALUES,
  type TaskStatusType,
} from '../constants/task-status.constant';

import { Op } from 'sequelize';
import { User } from '@Modules/user/entities/user.entity';
import type { TaskType } from '../constants/task-type.constant';
import { Project } from '@Modules/project/entities/project.entity';
import { Customer } from '@Modules/customer/entities/customer.entity';
import { ITask, TTaskCreationAttributes } from '../interfaces/task.interface';

@Table({
  tableName: 'tasks',
  paranoid: true,
  indexes: [
    {
      name: 'uq_tasks_project_protected_type',
      unique: true,
      fields: ['project_id', 'task_type'],
      where: { task_type: { [Op.in]: PROTECTED_TASK_TYPES } },
    },
    {
      name: 'idx_tasks_urgency_due_date',
      fields: [
        { name: 'is_urgent', order: 'DESC' },
        { name: 'due_date', order: 'ASC' },
        'id',
      ],
      where: { deleted_at: null },
    },
    {
      name: 'idx_tasks_assignee_id_status',
      fields: ['assignee_id', 'status'],
      where: { deleted_at: null },
    },
    {
      name: 'idx_tasks_project_id',
      fields: ['project_id'],
      where: { deleted_at: null },
    },
    {
      name: 'idx_tasks_customer_id',
      fields: ['customer_id'],
      where: { deleted_at: null },
    },
  ],
})
export class Task
  extends Model<ITask, TTaskCreationAttributes>
  implements ITask
{
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;
  @Column({ allowNull: false, type: DataType.STRING(TASK_STORED_TITLE_LENGTH) })
  declare title: string;
  @Default(TASK_TYPES.GENERAL)
  @Column({ allowNull: false, type: DataType.ENUM(...TASK_TYPE_VALUES) })
  declare taskType: TaskType;
  @ForeignKey(() => Project)
  @Column(DataType.UUID)
  declare projectId: string | null;
  @ForeignKey(() => Customer)
  @Column(DataType.UUID)
  declare customerId: string | null;
  @ForeignKey(() => User)
  @Column({ allowNull: false, type: DataType.UUID })
  declare createdById: string;
  @ForeignKey(() => User)
  @Column(DataType.UUID)
  declare assigneeId: string | null;
  @Column(DataType.TEXT)
  declare description: string | null;
  @Default(TASK_STATUSES.NOT_STARTED)
  @Column({ allowNull: false, type: DataType.ENUM(...TASK_STATUS_VALUES) })
  declare status: TaskStatusType;
  @Default(false)
  @Column({ allowNull: false, type: DataType.BOOLEAN })
  declare isUrgent: boolean;
  @ForeignKey(() => User)
  @Column(DataType.UUID)
  declare urgencyMarkedById: string | null;
  @Column(DataType.DATE(3))
  declare urgencyMarkedAt: Date | null;
  @Column(DataType.DATE(3))
  declare dueDate: Date | null;
  @CreatedAt declare createdAt: Date;
  @UpdatedAt declare updatedAt: Date;
  @DeletedAt declare deletedAt: Date | null;
  @BelongsTo(() => Project) declare project?: Project;
  @BelongsTo(() => Customer) declare customer?: Customer;
  @BelongsTo(() => User, 'assigneeId') declare assignee?: User;
  @BelongsTo(() => User, 'createdById') declare createdBy?: User;
  @BelongsTo(() => User, 'urgencyMarkedById') declare urgencyMarkedBy?: User;
}
