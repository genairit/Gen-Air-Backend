import {
  toTaskCursorPage,
  buildTaskCursorWhere,
} from '../utilities/task-cursor.utility';

import { PGlite } from '@electric-sql/pglite';
import { isObject } from '@Utilities/object.utility';
import { Op, FindOptions, Sequelize } from 'sequelize';
import { ITaskCursor } from '../interfaces/task.interface';
import { TASK_ORDERS } from '../constants/task-order.constant';
import { TaskSortType } from '../constants/task-sort.constant';
import { ICursorPage } from '@Interfaces/cursor-page.interface';

interface IQueryGenerator {
  selectQuery: (table: string, options: FindOptions) => unknown;
}
interface ITaskPositionRow {
  id: string;
  isUrgent: boolean;
  dueDate: Date | string | null;
}
interface ITaskPageRequest {
  batchSize: number;
  sort: TaskSortType;
  cursor: string | null;
}

const positions = [
  { id: 1, isUrgent: true, dueDate: null },
  { id: 2, isUrgent: false, dueDate: '2020-01-01T00:00:00.000Z' },
  { id: 3, isUrgent: true, dueDate: '2099-01-01T01:00:00.000Z' },
  { id: 4, isUrgent: false, dueDate: '2099-01-01T01:00:00.000Z' },
  { id: 5, isUrgent: false, dueDate: null },
  { id: 6, isUrgent: true, dueDate: '2100-01-01T00:00:00.000Z' },
  { id: 7, isUrgent: true, dueDate: '2099-01-01T01:00:00.000Z' },
  { id: 8, isUrgent: false, dueDate: null },
  { id: 9, isUrgent: false, dueDate: '2100-01-01T00:00:00.000Z' },
];

export const taskPositionId = (id: number): string =>
  `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`;

const isQueryGenerator = (value: unknown): value is IQueryGenerator =>
  isObject(value) && typeof value.selectQuery === 'function';

const toTaskPosition = (row: ITaskPositionRow): ITaskCursor => ({
  id: row.id,
  isUrgent: row.isUrgent,
  dueDate:
    typeof row.dueDate === 'string' ? new Date(row.dueDate) : row.dueDate,
});

export class TaskSortPaginationDatabase {
  private readonly database = new PGlite();
  private readonly sequelize = new Sequelize({
    dialect: 'postgres',
    logging: false,
  });

  async initialize(): Promise<void> {
    await this.database.exec(
      'CREATE TABLE task_sort_positions ("id" uuid PRIMARY KEY, "isUrgent" boolean NOT NULL, "dueDate" timestamptz(3))',
    );
    for (const position of positions) {
      await this.database.query(
        'INSERT INTO task_sort_positions ("id", "isUrgent", "dueDate") VALUES ($1,$2,$3)',
        [taskPositionId(position.id), position.isUrgent, position.dueDate],
      );
    }
  }

  async close(): Promise<void> {
    await Promise.all([this.database.close(), this.sequelize.close()]);
  }

  async readPage(request: ITaskPageRequest): Promise<ICursorPage<ITaskCursor>> {
    const generator = this.sequelize.getQueryInterface().queryGenerator;
    if (!isQueryGenerator(generator)) {
      throw new Error('Sequelize query generation is unavailable');
    }

    const query = generator.selectQuery('task_sort_positions', {
      attributes: ['id', 'isUrgent', 'dueDate'],
      where: { [Op.and]: buildTaskCursorWhere(request.cursor, request.sort) },
      order: TASK_ORDERS[request.sort],
      limit: request.batchSize + 1,
    });
    if (typeof query !== 'string') {
      throw new Error('Sequelize did not generate SQL');
    }

    const result = await this.database.query<ITaskPositionRow>(query);
    return toTaskCursorPage(result.rows.map(toTaskPosition), {
      sort: request.sort,
      batchSize: request.batchSize,
    });
  }

  async readAll(
    request: ITaskPageRequest,
    seen: string[] = [],
  ): Promise<ITaskCursor[]> {
    const page = await this.readPage(request);
    const cursor = page.nextCursor;
    if (cursor === null) {
      return page.items;
    }

    if (seen.includes(cursor)) {
      throw new Error('Pagination returned a repeated cursor');
    }

    const later = await this.readAll({ ...request, cursor }, [...seen, cursor]);
    return [...page.items, ...later];
  }
}
