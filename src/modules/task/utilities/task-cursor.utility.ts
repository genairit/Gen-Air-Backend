import { isUUID } from 'class-validator';
import { Op, WhereOptions } from 'sequelize';
import { isObject } from '@Utilities/object.utility';
import { isValidDate } from '@Utilities/date.utility';
import { ITaskCursor } from '../interfaces/task.interface';
import { ICursorPage } from '@Interfaces/cursor-page.interface';

export const encodeTaskCursor = (position: ITaskCursor): string =>
  Buffer.from(
    JSON.stringify({
      id: position.id,
      isUrgent: position.isUrgent,
      dueDate: position.dueDate?.toISOString() ?? null,
    }),
  ).toString('base64url');

export const decodeTaskCursor = (cursor: string | null): ITaskCursor | null => {
  if (!cursor) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    );
    if (!isObject(value)) {
      return null;
    }
    const { id, isUrgent, dueDate } = value;
    const validId = typeof id === 'string' && isUUID(id);
    const validDueDate =
      dueDate === null || (typeof dueDate === 'string' && isValidDate(dueDate));
    if (!validId || typeof isUrgent !== 'boolean' || !validDueDate) {
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

export const buildTaskCursorWhere = (cursor: string | null): WhereOptions[] => {
  const position = decodeTaskCursor(cursor);
  if (!position) {
    return [];
  }
  const sameUrgencyWhere: WhereOptions[] =
    position.dueDate === null
      ? [{ dueDate: null, id: { [Op.gt]: position.id } }]
      : [
          { dueDate: { [Op.gt]: position.dueDate } },
          { dueDate: null },
          { dueDate: position.dueDate, id: { [Op.gt]: position.id } },
        ];
  const lowerUrgencyWhere: WhereOptions[] = position.isUrgent
    ? [{ isUrgent: false }]
    : [];
  return [
    {
      [Op.or]: [
        ...lowerUrgencyWhere,
        { isUrgent: position.isUrgent, [Op.or]: sameUrgencyWhere },
      ],
    },
  ];
};

export const toTaskCursorPage = <T extends ITaskCursor>(
  rows: T[],
  batchSize: number,
): ICursorPage<T> => {
  const items = rows.slice(0, batchSize);
  const last = items.at(-1);
  return {
    items,
    nextCursor: rows.length > batchSize && last ? encodeTaskCursor(last) : null,
  };
};
