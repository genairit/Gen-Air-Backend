import {
  TASK_COUNT_INCLUDES,
  TASK_SEARCH_COLUMNS,
} from './constants/task-include.constant';

import { Op } from 'sequelize';
import { Task } from './entities/task.entity';
import { TaskRepository } from './task.repository';
import { ITaskFilter } from './interfaces/task.interface';

const CUSTOMER_ID = '00000000-0000-4000-8000-000000000003';
const EMPTY_FILTER: ITaskFilter = {
  search: null,
  status: null,
  isUrgent: null,
  projectId: null,
  assigneeId: null,
  customerId: null,
  unassigned: null,
};
const CUSTOMER_WHERE = {
  [Op.or]: [
    { customerId: CUSTOMER_ID },
    { '$project.customer_id$': CUSTOMER_ID },
    { '$project.parentProject.customer_id$': CUSTOMER_ID },
  ],
};

describe('task repository link queries', () => {
  const repository = new TaskRepository();

  afterEach(() => jest.restoreAllMocks());

  it('matches the customer filter on the task, project or parent building customer', async () => {
    const findAll = jest.spyOn(Task, 'findAll').mockResolvedValue([]);

    await repository.findByFilter(
      { ...EMPTY_FILTER, customerId: CUSTOMER_ID },
      { batchSize: 10, batchCursor: null },
    );

    expect(findAll.mock.calls[0]?.[0]?.where).toEqual({
      [Op.and]: [CUSTOMER_WHERE],
    });
  });

  it('searches the project and parent building customer names', async () => {
    const findAll = jest.spyOn(Task, 'findAll').mockResolvedValue([]);

    await repository.findByFilter(
      { ...EMPTY_FILTER, search: 'אור' },
      { batchSize: 10, batchCursor: null },
    );

    expect(TASK_SEARCH_COLUMNS).toContain('$project.customer.name$');
    expect(TASK_SEARCH_COLUMNS).toContain(
      '$project.parentProject.customer.name$',
    );
    expect(findAll.mock.calls[0]?.[0]?.where).toEqual({
      [Op.and]: [
        {
          [Op.or]: TASK_SEARCH_COLUMNS.map((column) => ({
            [column]: { [Op.iLike]: '%אור%' },
          })),
        },
      ],
    });
  });

  it('joins the project when counting by customer', async () => {
    const count = jest
      .spyOn(Task, 'count')
      .mockRejectedValue(new Error('query captured'));

    await expect(
      repository.countByFilter({ ...EMPTY_FILTER, customerId: CUSTOMER_ID }),
    ).rejects.toThrow('query captured');

    expect(count.mock.calls[0]?.[0]).toMatchObject({
      include: TASK_COUNT_INCLUDES,
      where: { [Op.and]: [CUSTOMER_WHERE] },
    });
  });
});
