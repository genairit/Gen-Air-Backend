import {
  CURSOR_DIRECTIONS,
  CursorDirectionType,
} from '@Constants/pagination.constant';

import {
  ICursorPage,
  ICursorPosition,
} from '@Interfaces/cursor-page.interface';

import { isUUID } from 'class-validator';
import { isObject } from './object.utility';
import { isValidDate } from './date.utility';
import { Op, Order, WhereOptions } from 'sequelize';

const CURSOR_ENCODING = 'base64url';

export const CURSOR_ORDER: Order = [
  ['createdAt', 'DESC'],
  ['id', 'DESC'],
];

export const CURSOR_ORDER_BY_DIRECTION: Record<CursorDirectionType, Order> = {
  [CURSOR_DIRECTIONS.NEWEST_FIRST]: CURSOR_ORDER,
  [CURSOR_DIRECTIONS.OLDEST_FIRST]: [
    ['createdAt', 'ASC'],
    ['id', 'ASC'],
  ],
};

const AFTER_CURSOR_OPERATOR_BY_DIRECTION = {
  [CURSOR_DIRECTIONS.NEWEST_FIRST]: Op.lt,
  [CURSOR_DIRECTIONS.OLDEST_FIRST]: Op.gt,
} as const satisfies Record<CursorDirectionType, symbol>;

const parseCursorJson = (cursor: string): unknown => {
  try {
    return JSON.parse(Buffer.from(cursor, CURSOR_ENCODING).toString('utf8'));
  } catch {
    return null;
  }
};

export const encodeCursor = (position: ICursorPosition): string => {
  const serializedPosition = JSON.stringify({
    id: position.id,
    createdAt: position.createdAt.toISOString(),
  });

  return Buffer.from(serializedPosition).toString(CURSOR_ENCODING);
};

export const decodeCursor = (
  cursor?: string | null,
): ICursorPosition | null => {
  if (!cursor) {
    return null;
  }

  const parsedCursor = parseCursorJson(cursor);

  if (!isObject(parsedCursor)) {
    return null;
  }

  const { id, createdAt } = parsedCursor;
  const hasValidId = typeof id === 'string' && isUUID(id);
  const hasValidDate = typeof createdAt === 'string' && isValidDate(createdAt);

  if (!hasValidId || !hasValidDate) {
    return null;
  }

  return { id, createdAt: new Date(createdAt) };
};

export const buildCursorWhere = (
  cursor?: string | null,
  direction: CursorDirectionType = CURSOR_DIRECTIONS.NEWEST_FIRST,
): WhereOptions[] => {
  const position = decodeCursor(cursor);

  if (!position) {
    return [];
  }

  const after = AFTER_CURSOR_OPERATOR_BY_DIRECTION[direction];

  return [
    {
      [Op.or]: [
        { createdAt: { [after]: position.createdAt } },
        { createdAt: position.createdAt, id: { [after]: position.id } },
      ],
    },
  ];
};

export const toCursorPage = <T extends ICursorPosition>(
  rows: T[],
  batchSize: number,
): ICursorPage<T> => {
  const items = rows.slice(0, batchSize);
  const lastItem = items.at(-1);
  const hasMoreRows = rows.length > batchSize;

  if (!hasMoreRows || !lastItem) {
    return { items, nextCursor: null };
  }

  return { items, nextCursor: encodeCursor(lastItem) };
};
