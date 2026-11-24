import {
  TaskSortType,
  TASK_SORT_VALUES,
} from '../constants/task-sort.constant';

export const isTaskSort = (value: unknown): value is TaskSortType =>
  TASK_SORT_VALUES.some((sort) => value === sort);
