import {
  ITaskCursor,
  ITaskCursorPageOptions,
} from '../interfaces/task.interface';

import {
  TASK_SORTS,
  TaskSortType,
  TASK_CURSOR_FORMAT,
} from '../constants/task-sort.constant';

import { isUUID } from 'class-validator';
import { WhereOptions } from 'sequelize';
import { isTaskSort } from './task-sort.utility';
import { BadRequestException } from '@nestjs/common';
import { isObject } from '@Utilities/object.utility';
import { isValidDate } from '@Utilities/date.utility';
import { ICursorPage } from '@Interfaces/cursor-page.interface';
import { TASK_CURSOR_PREDICATES } from '../constants/task-cursor.constant';

const isTaskCursorDate = (value: unknown): value is string | null => {
  if (value === null) {
    return true;
  }

  if (typeof value !== 'string') {
    return false;
  }

  if (!isValidDate(value)) {
    return false;
  }

  const parsed = new Date(value);
  const isDatabaseYear =
    parsed.getUTCFullYear() >= TASK_CURSOR_FORMAT.MIN_DATE_YEAR;
  const isCanonicalTimestamp = parsed.toISOString() === value;
  return isDatabaseYear && isCanonicalTimestamp;
};

export const encodeTaskCursor = (
  position: ITaskCursor,
  sort: TaskSortType = TASK_SORTS.DEFAULT,
): string =>
  Buffer.from(
    JSON.stringify({
      sort,
      id: position.id,
      isUrgent: position.isUrgent,
      dueDate: position.dueDate?.toISOString() ?? null,
    }),
  ).toString(TASK_CURSOR_FORMAT.ENCODING);

export const decodeTaskCursor = (
  cursor: string | null,
  sort: TaskSortType = TASK_SORTS.DEFAULT,
): ITaskCursor | null => {
  if (!cursor) {
    return null;
  }

  try {
    const bytes = Buffer.from(cursor, TASK_CURSOR_FORMAT.ENCODING);
    if (bytes.toString(TASK_CURSOR_FORMAT.ENCODING) !== cursor) {
      return null;
    }

    const value: unknown = JSON.parse(
      bytes.toString(TASK_CURSOR_FORMAT.TEXT_ENCODING),
    );
    if (!isObject(value)) {
      return null;
    }

    const { id, isUrgent, dueDate } = value;
    const cursorSort = 'sort' in value ? value.sort : TASK_SORTS.DEFAULT;
    const validId = typeof id === 'string' && isUUID(id);
    const validUrgency = typeof isUrgent === 'boolean';
    const validDueDate = isTaskCursorDate(dueDate);
    const validPosition = validId && validUrgency && validDueDate;
    const matchesSort = cursorSort === sort;
    if (!validPosition || !matchesSort) {
      return null;
    }

    return {
      id,
      isUrgent,
      dueDate: typeof dueDate === 'string' ? new Date(dueDate) : null,
    };
  } catch {
    return null;
  }
};

export const isTaskCursorForFilter = (
  cursor: unknown,
  filter: unknown,
): boolean => {
  const sort = isObject(filter)
    ? (filter.sort ?? TASK_SORTS.DEFAULT)
    : TASK_SORTS.DEFAULT;
  if (typeof cursor !== 'string' || !isTaskSort(sort)) {
    return false;
  }

  return decodeTaskCursor(cursor, sort) !== null;
};

export const buildTaskCursorWhere = (
  cursor: string | null,
  sort: TaskSortType = TASK_SORTS.DEFAULT,
): WhereOptions[] => {
  if (cursor === null) {
    return [];
  }

  const position = decodeTaskCursor(cursor, sort);
  if (!position) {
    throw new BadRequestException(TASK_CURSOR_FORMAT.INVALID_MESSAGE);
  }

  return [TASK_CURSOR_PREDICATES[sort]({ position, sort })];
};

export const toTaskCursorPage = <T extends ITaskCursor>(
  rows: T[],
  { batchSize, sort = TASK_SORTS.DEFAULT }: ITaskCursorPageOptions,
): ICursorPage<T> => {
  const items = rows.slice(0, batchSize);
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      rows.length > batchSize && last ? encodeTaskCursor(last, sort) : null,
  };
};
