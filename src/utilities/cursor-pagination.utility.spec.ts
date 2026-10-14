import {
  decodeCursor,
  encodeCursor,
  toCursorPage,
  buildCursorWhere,
} from './cursor-pagination.utility';

import { Op } from 'sequelize';
import { CURSOR_DIRECTIONS } from '@Constants/pagination.constant';

const POSITION = {
  id: '6f1c2b8e-3d4a-4b5c-9e7f-0a1b2c3d4e5f',
  createdAt: new Date('2026-10-07T10:00:00.123Z'),
};

const buildRows = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `00000000-0000-4000-8000-00000000000${index}`,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
  }));

describe('encodeCursor / decodeCursor', () => {
  it('round-trips a position', () => {
    expect(decodeCursor(encodeCursor(POSITION))).toEqual(POSITION);
  });

  it.each([
    ['an empty cursor', ''],
    ['a non-base64 cursor', '%%%'],
    [
      'a cursor without a uuid',
      Buffer.from('{"id":"1"}').toString('base64url'),
    ],
    [
      'a cursor with an invalid date',
      Buffer.from(
        JSON.stringify({ id: POSITION.id, createdAt: 'not-a-date' }),
      ).toString('base64url'),
    ],
  ])('returns null for %s', (_label, cursor) => {
    expect(decodeCursor(cursor)).toBeNull();
  });
});

describe('buildCursorWhere', () => {
  it('returns no conditions without a cursor', () => {
    expect(buildCursorWhere(null)).toEqual([]);
  });

  it('pages strictly after the cursor position using id as a tiebreaker', () => {
    expect(buildCursorWhere(encodeCursor(POSITION))).toEqual([
      {
        [Op.or]: [
          { createdAt: { [Op.lt]: POSITION.createdAt } },
          { createdAt: POSITION.createdAt, id: { [Op.lt]: POSITION.id } },
        ],
      },
    ]);
  });
});

describe('buildCursorWhere oldest first', () => {
  it('pages strictly after the cursor position in ascending order', () => {
    expect(
      buildCursorWhere(encodeCursor(POSITION), CURSOR_DIRECTIONS.OLDEST_FIRST),
    ).toEqual([
      {
        [Op.or]: [
          { createdAt: { [Op.gt]: POSITION.createdAt } },
          { createdAt: POSITION.createdAt, id: { [Op.gt]: POSITION.id } },
        ],
      },
    ]);
  });
});

describe('toCursorPage', () => {
  it('returns a next cursor pointing at the last item when more rows exist', () => {
    const rows = buildRows(3);
    const page = toCursorPage(rows, 2);

    expect(page.items).toEqual(rows.slice(0, 2));
    expect(decodeCursor(page.nextCursor)).toEqual(rows[1]);
  });

  it('returns a null cursor on the last page', () => {
    const rows = buildRows(2);

    expect(toCursorPage(rows, 2)).toEqual({ items: rows, nextCursor: null });
  });
});
