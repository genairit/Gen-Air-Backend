import {
  ValidationPipe,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';

import request from 'supertest';
import { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { TaskService } from './task.service';
import { AuthGuard } from '@Guards/auth.guard';
import { TaskController } from './task.controller';
import { TaskRepository } from './task.repository';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuthService } from '@Modules/auth/auth.service';
import { UserService } from '@Modules/user/user.service';
import { USER_ROLES } from '@Constants/user-role.constant';
import { IUser } from '@Modules/user/interfaces/user.interface';
import { ProjectService } from '@Modules/project/project.service';
import { DOMAIN_EVENTS } from '@Constants/domain-events.constant';
import { CustomerService } from '@Modules/customer/customer.service';
import { ITask, TTaskUpdateAttributes } from './interfaces/task.interface';
import { TaskStatusTransitionRepository } from './task-status-transition.repository';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';

const TASK_ID = '00000000-0000-4000-8000-000000000001';
const PROJECT_ID = '00000000-0000-4000-8000-000000000002';
const CUSTOMER_ID = '00000000-0000-4000-8000-000000000003';
const EMPLOYEE_ID = '00000000-0000-4000-8000-000000000004';
const OTHER_ID = '00000000-0000-4000-8000-000000000005';
const MANAGER_ID = '00000000-0000-4000-8000-000000000006';
const makeUser = (id: string, role: IUser['role']): IUser => ({
  id,
  role,
  email: `${id}@test.invalid`,
  phone: '0500000000',
  firstName: 'Test',
  lastName: 'User',
  employeeNumber: id,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
});
const users = {
  manager: makeUser(MANAGER_ID, USER_ROLES.SYSTEM_ADMIN),
  employee: makeUser(EMPLOYEE_ID, USER_ROLES.ENGINEER),
  other: makeUser(OTHER_ID, USER_ROLES.ENGINEER),
  secretary: makeUser(OTHER_ID, USER_ROLES.SECRETARY),
  finance: makeUser(OTHER_ID, USER_ROLES.FINANCE),
  installer: makeUser(OTHER_ID, USER_ROLES.INSTALLER),
  projectManager: makeUser(OTHER_ID, USER_ROLES.PROJECT_MANAGER),
};
const task = (): ITask => ({
  id: TASK_ID,
  projectId: PROJECT_ID,
  customerId: CUSTOMER_ID,
  createdById: MANAGER_ID,
  assigneeId: EMPLOYEE_ID,
  title: 'Task',
  description: null,
  dueDate: null,
  status: 'not_started',
  isUrgent: false,
  urgencyMarkedById: null,
  urgencyMarkedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
});

describe('Task HTTP permission boundaries', () => {
  const state = { task: task(), projectCustomerId: CUSTOMER_ID };
  const repository = {
    findById: jest.fn((): Promise<ITask | null> => Promise.resolve(state.task)),
    findDetailedById: jest
      .fn<Promise<ITask | null>, [string, object?]>()
      .mockImplementation(() => Promise.resolve(state.task)),
    findByFilter: jest.fn(() =>
      Promise.resolve({ items: [state.task], nextCursor: null }),
    ),
    create: jest.fn(() => Promise.resolve(state.task)),
    update: jest.fn((_id: string, changes: TTaskUpdateAttributes) => {
      state.task = { ...state.task, ...changes };
      return Promise.resolve();
    }),
    countByFilter: jest.fn(() =>
      Promise.resolve([{ status: 'not_started', isUrgent: false, count: 1 }]),
    ),
    softDelete: jest.fn(() => Promise.resolve()),
  };
  const transitions = {
    create: jest.fn<Promise<void>, [object, object?]>().mockResolvedValue(),
    findByTask: jest.fn(() => Promise.resolve([] as object[])),
  };
  const events = { emitAsync: jest.fn(() => Promise.resolve([])) };
  const userService = {
    getById: jest.fn((): Promise<IUser> => Promise.resolve(users.employee)),
  };
  const application: { app: INestApplication<Server> | null } = { app: null };
  const server = () => application.app!.getHttpServer();
  const payload = {
    projectId: PROJECT_ID,
    customerId: CUSTOMER_ID,
    title: 'New task',
    assigneeId: EMPLOYEE_ID,
    description: 'Required task description',
    dueDate: '2099-10-15',
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [TaskController],
      providers: [
        TaskService,
        { provide: TaskRepository, useValue: repository },
        { provide: TaskStatusTransitionRepository, useValue: transitions },
        {
          provide: ProjectService,
          useValue: {
            getById: jest.fn(() =>
              Promise.resolve({
                id: PROJECT_ID,
                customerId: state.projectCustomerId,
              }),
            ),
          },
        },
        {
          provide: CustomerService,
          useValue: {
            getById: jest.fn(() => Promise.resolve({ id: CUSTOMER_ID })),
          },
        },
        {
          provide: UserService,
          useValue: userService,
        },
        {
          provide: DatabaseTransactionService,
          useValue: { run: (work: () => Promise<unknown>) => work() },
        },
        { provide: EventEmitter2, useValue: events },
        {
          provide: AuthService,
          useValue: {
            authenticate: (token: string) => {
              if (!(token in users)) throw new UnauthorizedException();
              return Promise.resolve(users[token as keyof typeof users]);
            },
          },
        },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    }).compile();
    application.app = module.createNestApplication<INestApplication<Server>>();
    application.app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await application.app.init();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    state.task = task();
    state.projectCustomerId = CUSTOMER_ID;
    userService.getById.mockReset();
    userService.getById.mockImplementation(() =>
      Promise.resolve(users.employee),
    );
  });
  afterAll(async () => {
    await application.app?.close();
  });

  it('requires authentication', async () => {
    await request(server()).get('/task').expect(401);
  });
  it.each(['employee', 'secretary', 'projectManager', 'finance'])(
    'denies manager mutations to %s',
    async (token) => {
      await request(server())
        .post('/task')
        .auth(token, { type: 'bearer' })
        .send(payload)
        .expect(403);
      await request(server())
        .patch(`/task/${TASK_ID}`)
        .auth(token, { type: 'bearer' })
        .send({ assigneeId: OTHER_ID })
        .expect(403);
      await request(server())
        .patch(`/task/${TASK_ID}/urgency`)
        .auth(token, { type: 'bearer' })
        .send({ isUrgent: true })
        .expect(403);
      await request(server())
        .delete(`/task/${TASK_ID}`)
        .auth(token, { type: 'bearer' })
        .expect(403);
      expect(repository.update).not.toHaveBeenCalled();
    },
  );
  it.each(['secretary', 'installer', 'projectManager', 'finance'])(
    'denies status changes and claiming to %s',
    async (token) => {
      state.task.assigneeId = null;
      await request(server())
        .patch(`/task/${TASK_ID}/status`)
        .auth(token, { type: 'bearer' })
        .send({ status: 'in_progress' })
        .expect(403);
      await request(server())
        .patch(`/task/${TASK_ID}/claim`)
        .auth(token, { type: 'bearer' })
        .expect(403);
      expect(repository.update).not.toHaveBeenCalled();
    },
  );
  it('rejects assigning a task to a non-engineering employee', async () => {
    userService.getById.mockResolvedValueOnce(users.installer);
    await request(server())
      .post('/task')
      .auth('manager', { type: 'bearer' })
      .send(payload)
      .expect(400);
    userService.getById.mockResolvedValueOnce(users.secretary);
    await request(server())
      .patch(`/task/${TASK_ID}`)
      .auth('manager', { type: 'bearer' })
      .send({ assigneeId: OTHER_ID })
      .expect(400);
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
  });
  it('denies management claiming a task', async () => {
    state.task.assigneeId = null;
    await request(server())
      .patch(`/task/${TASK_ID}/claim`)
      .auth('manager', { type: 'bearer' })
      .expect(403);
    expect(state.task.assigneeId).toBeNull();
  });
  it('lets an admin edit a task that keeps its legacy non-engineer assignee', async () => {
    state.task = { ...task(), assigneeId: OTHER_ID };
    userService.getById.mockResolvedValue(users.installer);
    await request(server())
      .patch(`/task/${TASK_ID}`)
      .auth('manager', { type: 'bearer' })
      .send({ title: 'Renamed' })
      .expect(200);
    await request(server())
      .patch(`/task/${TASK_ID}`)
      .auth('manager', { type: 'bearer' })
      .send({ title: 'Renamed again', assigneeId: OTHER_ID })
      .expect(200);
    expect(userService.getById).not.toHaveBeenCalled();
    expect(state.task.title).toBe('Renamed again');
  });
  it('allows engineers and admins to change status', async () => {
    await request(server())
      .patch(`/task/${TASK_ID}/status`)
      .auth('employee', { type: 'bearer' })
      .send({ status: 'in_progress' })
      .expect(200);
    expect(state.task.status).toBe('in_progress');
    await request(server())
      .patch(`/task/${TASK_ID}/status`)
      .auth('other', { type: 'bearer' })
      .send({ status: 'in_review' })
      .expect(200);
    await request(server())
      .patch(`/task/${TASK_ID}/status`)
      .auth('manager', { type: 'bearer' })
      .send({ status: 'in_review' })
      .expect(200);
  });
  it('records who changed the status, from and to, and nothing for a repeat', async () => {
    state.task = { ...state.task, status: 'not_started' };
    transitions.create.mockClear();
    const changeTo = (status: string) =>
      request(server())
        .patch(`/task/${TASK_ID}/status`)
        .auth('employee', { type: 'bearer' })
        .send({ status })
        .expect(200);

    await changeTo('in_progress');
    await changeTo('in_progress');

    expect(transitions.create).toHaveBeenCalledTimes(1);
    expect(transitions.create.mock.calls[0][0]).toEqual({
      taskId: TASK_ID,
      toStatus: 'in_progress',
      changedById: EMPLOYEE_ID,
      fromStatus: 'not_started',
    });
  });

  it('records the initial status when a task is created', async () => {
    transitions.create.mockClear();

    await request(server())
      .post('/task')
      .auth('manager', { type: 'bearer' })
      .send(payload)
      .expect(201);

    expect(transitions.create.mock.calls[0][0]).toMatchObject({
      taskId: TASK_ID,
      fromStatus: null,
      changedById: MANAGER_ID,
    });
  });

  it('returns the status history from the repository and 404s for a missing task', async () => {
    const history = [{ id: 'newest' }, { id: 'oldest' }];
    transitions.findByTask.mockResolvedValueOnce(history);

    const response = await request(server())
      .get(`/task/${TASK_ID}/transitions`)
      .auth('employee', { type: 'bearer' })
      .expect(200);

    expect(response.body).toEqual(history);
    expect(transitions.findByTask).toHaveBeenCalledWith(TASK_ID);

    repository.findById.mockResolvedValueOnce(null);
    await request(server())
      .get(`/task/${TASK_ID}/transitions`)
      .auth('employee', { type: 'bearer' })
      .expect(404);
  });

  it('blocks status/urgency mass assignment and invalid status', async () => {
    await request(server())
      .patch(`/task/${TASK_ID}`)
      .auth('manager', { type: 'bearer' })
      .send({ status: 'in_progress', isUrgent: true })
      .expect(400);
    await request(server())
      .patch(`/task/${TASK_ID}/status`)
      .auth('employee', { type: 'bearer' })
      .send({ status: 'in_progress', isUrgent: true })
      .expect(400);
    await request(server())
      .patch(`/task/${TASK_ID}/status`)
      .auth('employee', { type: 'bearer' })
      .send({ status: 'unknown' })
      .expect(400);
  });
  it('shares the task list while keeping my tasks scoped to the caller', async () => {
    await request(server())
      .get(`/task?assigneeId=${OTHER_ID}&isUrgent=false`)
      .auth('employee', { type: 'bearer' })
      .expect(200);
    expect(repository.findByFilter).toHaveBeenLastCalledWith(
      expect.objectContaining({ assigneeId: OTHER_ID, isUrgent: false }),
      expect.anything(),
    );
    await request(server())
      .get(`/task/my-tasks?assigneeId=${OTHER_ID}`)
      .auth('manager', { type: 'bearer' })
      .expect(200);
    expect(repository.findByFilter).toHaveBeenLastCalledWith(
      expect.objectContaining({ assigneeId: MANAGER_ID }),
      expect.anything(),
    );
    await request(server())
      .get(`/task/${TASK_ID}`)
      .auth('other', { type: 'bearer' })
      .expect(200);
  });
  it('emits only on false-to-true urgency transitions', async () => {
    await request(server())
      .patch(`/task/${TASK_ID}/urgency`)
      .auth('manager', { type: 'bearer' })
      .send({ isUrgent: true })
      .expect(200);
    expect(events.emitAsync).toHaveBeenCalledWith(
      DOMAIN_EVENTS.TASK_BECAME_URGENT,
      expect.objectContaining({ taskId: TASK_ID, changedById: MANAGER_ID }),
    );
    await request(server())
      .patch(`/task/${TASK_ID}/urgency`)
      .auth('manager', { type: 'bearer' })
      .send({ isUrgent: true })
      .expect(200);
    expect(events.emitAsync).toHaveBeenCalledTimes(1);
    await request(server())
      .patch(`/task/${TASK_ID}/urgency`)
      .auth('manager', { type: 'bearer' })
      .send({ isUrgent: false })
      .expect(200);
    expect(events.emitAsync).toHaveBeenCalledTimes(1);
  });
  it('permits manager CRUD and rejects null required fields', async () => {
    await request(server())
      .post('/task')
      .auth('manager', { type: 'bearer' })
      .send(payload)
      .expect(201);
    await request(server())
      .patch(`/task/${TASK_ID}`)
      .auth('manager', { type: 'bearer' })
      .send({ title: null })
      .expect(400);
    await request(server())
      .patch(`/task/${TASK_ID}`)
      .auth('manager', { type: 'bearer' })
      .send({ title: ' Updated ', assigneeId: null })
      .expect(200);
    expect(state.task.title).toBe('Updated');
    expect(state.task.assigneeId).toBeNull();
    await request(server())
      .delete(`/task/${TASK_ID}`)
      .auth('manager', { type: 'bearer' })
      .expect(204);
  });
  it('keeps the due date and description required on edit', async () => {
    const reject = (changes: object) =>
      request(server())
        .patch(`/task/${TASK_ID}`)
        .auth('manager', { type: 'bearer' })
        .send(changes)
        .expect(400);

    await reject({ dueDate: null });
    await reject({ description: null });
    await reject({ description: '   ' });
    await reject({ dueDate: '2000-01-01' });
    expect(repository.update).not.toHaveBeenCalledWith(
      TASK_ID,
      expect.objectContaining({ dueDate: null }),
      expect.anything(),
    );
  });

  it('passes the search through to the task list but not to the counts', async () => {
    await request(server())
      .get('/task?search=מדידה')
      .auth('employee', { type: 'bearer' })
      .expect(200);
    expect(repository.findByFilter).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'מדידה' }),
      expect.anything(),
    );
    await request(server())
      .get('/task/counts?search=מדידה')
      .auth('employee', { type: 'bearer' })
      .expect(200);
    expect(repository.countByFilter).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: null }),
    );
  });

  it('returns the task with its related records', async () => {
    await request(server())
      .get(`/task/${TASK_ID}`)
      .auth('employee', { type: 'bearer' })
      .expect(200);
    expect(repository.findDetailedById.mock.calls.at(-1)?.[0]).toBe(TASK_ID);
  });

  it('rejects malformed UUIDs, booleans, and blank titles', async () => {
    await request(server())
      .get('/task/invalid')
      .auth('manager', { type: 'bearer' })
      .expect(400);
    await request(server())
      .get('/task?isUrgent=invalid')
      .auth('manager', { type: 'bearer' })
      .expect(400);
    await request(server())
      .post('/task')
      .auth('manager', { type: 'bearer' })
      .send({ ...payload, title: '  ' })
      .expect(400);
  });
  it('returns 404 for a missing task', async () => {
    repository.findDetailedById.mockResolvedValueOnce(null);
    await request(server())
      .get(`/task/${TASK_ID}`)
      .auth('manager', { type: 'bearer' })
      .expect(404);
  });
  it('rejects a task customer different from the project customer', async () => {
    state.projectCustomerId = OTHER_ID;
    await request(server())
      .post('/task')
      .auth('manager', { type: 'bearer' })
      .send(payload)
      .expect(400);
    expect(repository.create).not.toHaveBeenCalled();
  });
  it('does not emit urgency events when the database transaction fails', async () => {
    const transactions = application.app!.get(DatabaseTransactionService);
    const failure = jest
      .spyOn(transactions, 'run')
      .mockRejectedValueOnce(new Error('transaction failed'));
    await request(server())
      .patch(`/task/${TASK_ID}/urgency`)
      .auth('manager', { type: 'bearer' })
      .send({ isUrgent: true })
      .expect(500);
    expect(events.emitAsync).not.toHaveBeenCalled();
    failure.mockRestore();
  });
  it('requires nonblank description and a due date from today onward on create', async () => {
    for (const change of [
      { description: null },
      { description: '  ' },
      { dueDate: null },
      { dueDate: '2000-01-01' },
    ]) {
      await request(server())
        .post('/task')
        .auth('manager', { type: 'bearer' })
        .send({ ...payload, ...change })
        .expect(400);
    }
    expect(repository.create).not.toHaveBeenCalled();
  });
  it('claims only unassigned tasks as the authenticated caller', async () => {
    state.task.assigneeId = null;
    await request(server())
      .patch(`/task/${TASK_ID}/claim`)
      .auth('employee', { type: 'bearer' })
      .send({ assigneeId: OTHER_ID })
      .expect(200);
    expect(state.task.assigneeId).toBe(EMPLOYEE_ID);
    await request(server())
      .patch(`/task/${TASK_ID}/claim`)
      .auth('other', { type: 'bearer' })
      .expect(409);
    expect(state.task.assigneeId).toBe(EMPLOYEE_ID);
  });
  it('records, preserves, and clears the current urgency audit', async () => {
    await request(server())
      .patch(`/task/${TASK_ID}/urgency`)
      .auth('manager', { type: 'bearer' })
      .send({ isUrgent: true })
      .expect(200);
    const markedAt = state.task.urgencyMarkedAt;
    expect(state.task.urgencyMarkedById).toBe(MANAGER_ID);
    expect(markedAt).toBeInstanceOf(Date);
    await request(server())
      .patch(`/task/${TASK_ID}/urgency`)
      .auth('manager', { type: 'bearer' })
      .send({ isUrgent: true })
      .expect(200);
    expect(state.task.urgencyMarkedAt).toBe(markedAt);
    await request(server())
      .patch(`/task/${TASK_ID}/urgency`)
      .auth('manager', { type: 'bearer' })
      .send({ isUrgent: false })
      .expect(200);
    expect(state.task.urgencyMarkedAt).toBeNull();
    expect(state.task.urgencyMarkedById).toBeNull();
  });
  it('returns tab counts without the selected status/urgency and scopes my counts', async () => {
    await request(server())
      .get('/task/counts?status=in_review&isUrgent=true&unassigned=true')
      .auth('employee', { type: 'bearer' })
      .expect(200);
    expect(repository.countByFilter).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: null,
        isUrgent: null,
        unassigned: true,
      }),
    );
    await request(server())
      .get(`/task/my-tasks/counts?assigneeId=${OTHER_ID}`)
      .auth('employee', { type: 'bearer' })
      .expect(200);
    expect(repository.countByFilter).toHaveBeenLastCalledWith(
      expect.objectContaining({ assigneeId: EMPLOYEE_ID }),
    );
  });
});
