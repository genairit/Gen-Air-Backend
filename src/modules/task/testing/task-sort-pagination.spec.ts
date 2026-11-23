import {
  taskPositionId,
  TaskSortPaginationDatabase,
} from './task-sort-pagination.fixture';

import { TIME_UNITS } from '@Constants/time.constant';
import { TASK_SORTS } from '../constants/task-sort.constant';

const orders = [
  { sort: TASK_SORTS.DEFAULT, expected: [3, 7, 6, 1, 2, 4, 9, 5, 8] },
  { sort: TASK_SORTS.DUE_DATE_ASC, expected: [2, 3, 4, 7, 6, 9, 1, 5, 8] },
  { sort: TASK_SORTS.DUE_DATE_DESC, expected: [6, 9, 3, 4, 7, 2, 1, 5, 8] },
];

describe('task sorting through PostgreSQL cursor pages', () => {
  const database = new TaskSortPaginationDatabase();
  beforeAll(() => database.initialize(), 30 * TIME_UNITS.SECOND_MS);
  afterAll(() => database.close());

  describe.each(orders)('$sort', ({ sort, expected }) => {
    it.each([1, 2, 4])(
      'traverses all records in batches of %i without missing or duplicate tasks',
      async (batchSize) => {
        const rows = await database.readAll({ sort, batchSize, cursor: null });
        const ids = rows.map((row) => row.id);
        expect(ids).toEqual(expected.map(taskPositionId));
        expect(new Set(ids).size).toBe(expected.length);
      },
    );
  });
});
