import { Test } from '@nestjs/testing';
import { Sequelize, Transaction } from 'sequelize';
import { TaskRepository } from '@Modules/task/task.repository';
import { TASK_TYPES } from '@Modules/task/constants/task-type.constant';
import { TASK_STATUSES } from '@Modules/task/constants/task-status.constant';
import { TTaskCreationAttributes } from '@Modules/task/interfaces/task.interface';
import { ProjectTaskInitializationService } from './project-task-initialization.service';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import { TaskStatusTransitionRepository } from '@Modules/task/task-status-transition.repository';

const PROJECT = { id: 'project-1', name: 'בניין לדוגמה' };
const CREATOR = { id: 'creator-1' };

const setup = async () => {
  const transaction = new Transaction(
    new Sequelize({ dialect: 'postgres', logging: false }),
    {},
  );
  const tasks = {
    findProtectedForProject: jest.fn().mockResolvedValue([]),
    create: jest.fn((attributes: TTaskCreationAttributes) =>
      Promise.resolve({
        ...attributes,
        id: `task-${attributes.taskType}`,
        status: TASK_STATUSES.NOT_STARTED,
      }),
    ),
  };
  const transitions = { create: jest.fn().mockResolvedValue(null) };
  const transactions = { lockKey: jest.fn().mockResolvedValue(null) };
  const module = await Test.createTestingModule({
    providers: [
      ProjectTaskInitializationService,
      { provide: TaskRepository, useValue: tasks },
      { provide: TaskStatusTransitionRepository, useValue: transitions },
      { provide: DatabaseTransactionService, useValue: transactions },
    ],
  }).compile();
  return {
    service: module.get(ProjectTaskInitializationService),
    tasks,
    transitions,
    transactions,
    transaction,
  };
};

describe('ProjectTaskInitializationService', () => {
  it('creates the exact unassigned pair and opening history within the caller transaction', async () => {
    const state = await setup();
    await state.service.ensureForProject(PROJECT, CREATOR, state.transaction);
    expect(state.transactions.lockKey).toHaveBeenCalledWith(
      `project-mandatory-tasks:${PROJECT.id}`,
      state.transaction,
    );
    expect(state.tasks.findProtectedForProject).toHaveBeenCalledWith(
      PROJECT.id,
      state.transaction,
    );
    expect(state.tasks.create).toHaveBeenCalledTimes(2);
    expect(state.tasks.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        title: 'הצעת מחיר — בניין לדוגמה',
        taskType: TASK_TYPES.QUOTATION,
        projectId: PROJECT.id,
        customerId: null,
        createdById: CREATOR.id,
        assigneeId: null,
        dueDate: null,
        description:
          'הכנת הצעת מחיר עבור הפרויקט בניין לדוגמה: ריכוז דרישות הלקוח והפריטים הנדרשים, קביעת כמויות ומחירים ובדיקת תנאי התשלום, לצורך הכנת הצעה מסודרת ללקוח.',
      }),
      state.transaction,
    );
    expect(state.tasks.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        title: 'תכנון — בניין לדוגמה',
        taskType: TASK_TYPES.PLANNING,
        projectId: PROJECT.id,
        customerId: null,
        createdById: CREATOR.id,
        assigneeId: null,
        dueDate: null,
        description:
          'הכנת תכנון עבור הפרויקט בניין לדוגמה: בחינת דרישות הפרויקט והתוכניות הזמינות, גיבוש פתרון המיזוג ותיאום הפרטים הנדרשים להכנת תוכנית לביצוע.',
      }),
      state.transaction,
    );
    expect(state.transitions.create).toHaveBeenNthCalledWith(
      1,
      {
        taskId: 'task-quotation',
        fromStatus: null,
        toStatus: TASK_STATUSES.NOT_STARTED,
        changedById: CREATOR.id,
      },
      state.transaction,
    );
    expect(state.transitions.create).toHaveBeenNthCalledWith(
      2,
      {
        taskId: 'task-planning',
        fromStatus: null,
        toStatus: TASK_STATUSES.NOT_STARTED,
        changedById: CREATOR.id,
      },
      state.transaction,
    );
    expect(state.transactions.lockKey.mock.invocationCallOrder[0]).toBeLessThan(
      state.tasks.findProtectedForProject.mock.invocationCallOrder[0],
    );
    expect(
      state.tasks.findProtectedForProject.mock.invocationCallOrder[0],
    ).toBeLessThan(state.tasks.create.mock.invocationCallOrder[0]);
  });

  it('preserves completed or archived lifetime slots and their history on retry', async () => {
    const state = await setup();
    const existing = [
      {
        id: 'quote-existing',
        taskType: TASK_TYPES.QUOTATION,
        status: TASK_STATUSES.PROPOSAL_SENT,
      },
      {
        id: 'plan-existing',
        taskType: TASK_TYPES.PLANNING,
        deletedAt: new Date('2026-10-01'),
      },
    ];
    state.tasks.findProtectedForProject.mockResolvedValue(existing);
    await state.service.ensureForProject(PROJECT, CREATOR, state.transaction);
    expect(state.tasks.create).not.toHaveBeenCalled();
    expect(state.transitions.create).not.toHaveBeenCalled();
    expect(existing[0].id).toBe('quote-existing');
    expect(existing[0].status).toBe(TASK_STATUSES.PROPOSAL_SENT);
  });

  it('fills only a missing protected slot without replacing an existing task', async () => {
    const state = await setup();
    state.tasks.findProtectedForProject.mockResolvedValue([
      { id: 'quote-existing', taskType: TASK_TYPES.QUOTATION },
    ]);
    await state.service.ensureForProject(PROJECT, CREATOR, state.transaction);
    expect(state.tasks.create).toHaveBeenCalledTimes(1);
    expect(state.tasks.create).toHaveBeenCalledWith(
      expect.objectContaining({ taskType: TASK_TYPES.PLANNING }),
      state.transaction,
    );
    expect(state.transitions.create).toHaveBeenCalledTimes(1);
  });

  it('propagates a history write failure so the caller transaction can roll back everything', async () => {
    const state = await setup();
    state.transitions.create.mockRejectedValueOnce(
      new Error('history unavailable'),
    );
    await expect(
      state.service.ensureForProject(PROJECT, CREATOR, state.transaction),
    ).rejects.toThrow('history unavailable');
    expect(state.tasks.create).toHaveBeenCalledTimes(1);
  });
});
