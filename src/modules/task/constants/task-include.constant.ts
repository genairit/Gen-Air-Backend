import { Includeable } from 'sequelize';
import { User } from '@Modules/user/entities/user.entity';
import { Project } from '@Modules/project/entities/project.entity';
import { Customer } from '@Modules/customer/entities/customer.entity';

export const TASK_DETAIL_INCLUDES: Includeable[] = [
  { model: User, as: 'assignee', paranoid: false },
  { model: User, as: 'createdBy', paranoid: false },
  { model: User, as: 'urgencyMarkedBy', paranoid: false },
  { model: Project, paranoid: false, attributes: ['id', 'code', 'name'] },
  { model: Customer, paranoid: false, attributes: ['id', 'name'] },
];
