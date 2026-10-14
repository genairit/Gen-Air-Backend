import {
  TaskStatusType,
  TASK_STATUS_VALUES,
} from '../constants/task-status.constant';

export const isTaskStatus = (value: unknown): value is TaskStatusType =>
  TASK_STATUS_VALUES.some((status) => status === value);
