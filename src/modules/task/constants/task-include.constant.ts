import { Includeable } from 'sequelize';
import { User } from '@Modules/user/entities/user.entity';
import { Project } from '@Modules/project/entities/project.entity';
import { buildCustomerReferenceInclude } from '@Modules/customer/constants/customer-reference.constant';

export const TASK_PROJECT_ATTRIBUTES = ['id', 'code', 'name'] as const;

export type TaskProjectAttributeType = (typeof TASK_PROJECT_ATTRIBUTES)[number];

export const TASK_DETAIL_INCLUDES: Includeable[] = [
  { model: User, as: 'assignee', paranoid: false },
  { model: User, as: 'createdBy', paranoid: false },
  { model: User, as: 'urgencyMarkedBy', paranoid: false },
  {
    model: Project,
    paranoid: false,
    attributes: [...TASK_PROJECT_ATTRIBUTES],
    include: [
      buildCustomerReferenceInclude(),
      {
        model: Project,
        paranoid: false,
        as: 'parentProject',
        attributes: [...TASK_PROJECT_ATTRIBUTES],
        include: [buildCustomerReferenceInclude()],
      },
    ],
  },
  buildCustomerReferenceInclude(),
];

export const TASK_CUSTOMER_PRECEDENCE_COLUMNS = [
  'project.customer_id',
  'project->parentProject.customer_id',
  'Task.customer_id',
] as const;

export const TASK_COUNT_INCLUDES: Includeable[] = [
  {
    model: Project,
    paranoid: false,
    attributes: [],
    include: [
      { model: Project, as: 'parentProject', paranoid: false, attributes: [] },
    ],
  },
];

export const TASK_SEARCH_COLUMNS = [
  'title',
  '$project.name$',
  '$project.code$',
  '$customer.name$',
  '$project.customer.name$',
  '$project.parentProject.customer.name$',
  '$assignee.first_name$',
  '$assignee.last_name$',
] as const;
