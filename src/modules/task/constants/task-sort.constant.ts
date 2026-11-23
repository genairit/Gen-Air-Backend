export const TASK_SORTS = {
  DEFAULT: 'default',
  DUE_DATE_ASC: 'due_date_asc',
  DUE_DATE_DESC: 'due_date_desc',
} as const;

export type TaskSortType = (typeof TASK_SORTS)[keyof typeof TASK_SORTS];

export const TASK_SORT_VALUES = Object.values(TASK_SORTS);

export const TASK_CURSOR_FORMAT = {
  MIN_DATE_YEAR: 1,
  ENCODING: 'base64url',
  TEXT_ENCODING: 'utf8',
  INVALID_MESSAGE: 'batchCursor must match the requested task sort',
} as const;
