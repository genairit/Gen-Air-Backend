import {
  decodeTaskCursor,
  encodeTaskCursor,
  toTaskCursorPage,
  buildTaskCursorWhere,
} from './task-cursor.utility';

import { BadRequestException } from '@nestjs/common';
import { TASK_SORTS, TASK_SORT_VALUES } from '../constants/task-sort.constant';

const first = {
  id: '00000000-0000-4000-8000-000000000001',
  isUrgent: true,
  dueDate: new Date('2099-01-01'),
};
const rawCursor = (value: unknown): string =>
  Buffer.from(JSON.stringify(value)).toString('base64url');
const legacyCursor = rawCursor(first);

const invalidPositions = [
  null,
  [],
  {},
  { ...first, id: 'not-a-uuid' },
  { id: first.id, createdAt: '2099-01-01' },
  { id: first.id, dueDate: null },
  { ...first, isUrgent: 'true' },
  { ...first, dueDate: 'invalid' },
  { ...first, dueDate: '0000-01-01T00:00:00.000Z' },
  { ...first, dueDate: '2099-02-30T00:00:00.000Z' },
  { ...first, dueDate: '2099-01-01' },
  { ...first, sort: 'unsupported' },
  { ...first, sort: null },
];

describe('task cursor contract', () => {
  it.each(TASK_SORT_VALUES)(
    'round-trips date and null-date positions for %s',
    (sort) => {
      expect(decodeTaskCursor(encodeTaskCursor(first, sort), sort)).toEqual(
        first,
      );
      expect(
        decodeTaskCursor(
          encodeTaskCursor({ ...first, dueDate: null }, sort),
          sort,
        ),
      ).toEqual({ ...first, dueDate: null });
    },
  );

  it('keeps the previous untagged cursor compatible only with default order', () => {
    expect(decodeTaskCursor(legacyCursor)).toEqual(first);
    expect(buildTaskCursorWhere(legacyCursor)).toHaveLength(1);
    expect(decodeTaskCursor(legacyCursor, TASK_SORTS.DUE_DATE_ASC)).toBeNull();
    expect(decodeTaskCursor(legacyCursor, TASK_SORTS.DUE_DATE_DESC)).toBeNull();
  });

  it.each(invalidPositions)('rejects malformed position %j', (position) => {
    const cursor = rawCursor(position);
    expect(decodeTaskCursor(cursor)).toBeNull();
    expect(() => buildTaskCursorWhere(cursor)).toThrow(BadRequestException);
  });

  it.each(['', 'invalid', `${legacyCursor}!`, `${legacyCursor}=`])(
    'rejects noncanonical cursor text %s instead of restarting a page',
    (cursor) => {
      expect(decodeTaskCursor(cursor)).toBeNull();
      expect(() => buildTaskCursorWhere(cursor)).toThrow(BadRequestException);
    },
  );

  it('treats only an absent cursor as the first page', () => {
    expect(decodeTaskCursor(null)).toBeNull();
    expect(buildTaskCursorWhere(null)).toEqual([]);
  });

  it.each(TASK_SORT_VALUES)(
    'rejects changing order after receiving a %s cursor',
    (sort) => {
      const cursor = encodeTaskCursor(first, sort);
      const otherSorts = TASK_SORT_VALUES.filter((other) => other !== sort);
      for (const other of otherSorts) {
        expect(decodeTaskCursor(cursor, other)).toBeNull();
        expect(() => buildTaskCursorWhere(cursor, other)).toThrow(
          BadRequestException,
        );
      }
    },
  );

  it.each(TASK_SORT_VALUES)(
    'emits a tagged continuation only when %s has another page',
    (sort) => {
      const second = { ...first, id: '00000000-0000-4000-8000-000000000002' };
      const page = toTaskCursorPage([first, second], { batchSize: 1, sort });
      expect(page.items).toEqual([first]);
      expect(decodeTaskCursor(page.nextCursor, sort)).toEqual(first);
      expect(
        toTaskCursorPage([second], { batchSize: 1, sort }).nextCursor,
      ).toBeNull();
    },
  );
});
