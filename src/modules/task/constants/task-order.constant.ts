import { Op, Order } from 'sequelize';
import { TASK_SORTS, TaskSortType } from './task-sort.constant';

export const TASK_ORDER: Order = [
  ['isUrgent', 'DESC'],
  ['dueDate', 'ASC NULLS LAST'],
  ['id', 'ASC'],
];

export const TASK_ORDERS: Record<TaskSortType, Order> = {
  [TASK_SORTS.DEFAULT]: TASK_ORDER,
  [TASK_SORTS.DUE_DATE_ASC]: [
    ['dueDate', 'ASC NULLS LAST'],
    ['id', 'ASC'],
  ],
  [TASK_SORTS.DUE_DATE_DESC]: [
    ['dueDate', 'DESC NULLS LAST'],
    ['id', 'ASC'],
  ],
};

export const TASK_DATE_COMPARISONS: Record<
  TaskSortType,
  typeof Op.gt | typeof Op.lt
> = {
  [TASK_SORTS.DEFAULT]: Op.gt,
  [TASK_SORTS.DUE_DATE_ASC]: Op.gt,
  [TASK_SORTS.DUE_DATE_DESC]: Op.lt,
};
