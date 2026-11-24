import {
  taskDueCursorPredicate,
  taskUrgentCursorPredicate,
} from '../utilities/task-cursor-predicate.utility';

import { WhereOptions } from 'sequelize';
import { TASK_SORTS, TaskSortType } from './task-sort.constant';
import { ITaskCursorContext } from '../interfaces/task.interface';

export const TASK_CURSOR_PREDICATES: Record<
  TaskSortType,
  (context: ITaskCursorContext) => WhereOptions
> = {
  [TASK_SORTS.DEFAULT]: taskUrgentCursorPredicate,
  [TASK_SORTS.DUE_DATE_ASC]: taskDueCursorPredicate,
  [TASK_SORTS.DUE_DATE_DESC]: taskDueCursorPredicate,
};
