import { Order } from 'sequelize';

export const TASK_ORDER: Order = [
  ['isUrgent', 'DESC'],
  ['dueDate', 'ASC NULLS LAST'],
  ['id', 'ASC'],
];
