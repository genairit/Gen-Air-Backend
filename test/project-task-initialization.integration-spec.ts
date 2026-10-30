import {
  TProjectTaskEnvironment,
  createProjectTaskEnvironment,
} from './project-task-initialization.fixture';

import {
  IMPORT_ROW,
  makeImportFile,
} from '@Modules/project/testing/apartment-import.fixture';

import { Task } from '@Modules/task/entities/task.entity';
import { USER_ROLES } from '@Constants/user-role.constant';
import { QueryTypes, UniqueConstraintError } from 'sequelize';
import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { Project } from '@Modules/project/entities/project.entity';
import { TASK_TYPES } from '@Modules/task/constants/task-type.constant';
import { PROJECT_STATUS_IDS } from '@Constants/project-status.constant';
import { TASK_STATUSES } from '@Modules/task/constants/task-status.constant';
import { toProjectTaskAttributes } from '@Modules/project/utilities/project-task.utility';
import { TaskStatusTransition } from '@Modules/task/entities/task-status-transition.entity';

const state: { environment: TProjectTaskEnvironment | null } = {
  environment: null,
};
const getEnvironment = () => {
  if (!state.environment) {
    throw new Error(
      'The isolated project task environment is not initialized.',
    );
  }
  return state.environment;
};

const expectProtectedPair = async (projectId: string, name: string) => {
  const tasks = await Task.findAll({ where: { projectId } });
  expect(tasks).toHaveLength(2);
  expect(tasks.map((task) => task.taskType).sort()).toEqual(
    [TASK_TYPES.PLANNING, TASK_TYPES.QUOTATION].sort(),
  );
  for (const task of tasks) {
    expect(task.customerId).toBeNull();
    expect(task.assigneeId).toBeNull();
    expect(task.dueDate).toBeNull();
    expect(task.status).toBe(TASK_STATUSES.NOT_STARTED);
    expect(task.description).toContain(name);
    expect(task.title).toContain(name);
    const history = await TaskStatusTransition.findAll({
      where: { taskId: task.id },
    });
    expect(history).toHaveLength(1);
    expect(history[0].fromStatus).toBeNull();
    expect(history[0].toStatus).toBe(TASK_STATUSES.NOT_STARTED);
  }
  return tasks;
};

describe('project task initialization against isolated PostgreSQL', () => {
  beforeAll(async () => {
    state.environment = await createProjectTaskEnvironment();
  });
  afterAll(async () => {
    await state.environment?.close();
  });
  beforeEach(() => {
    getEnvironment().events.emitAsync.mockClear();
  });
  afterEach(async () => {
    await state.environment?.restorePlanning();
  });

  it('applies the actual migration twice without reassigning legacy projects/tasks/history and retains fixed statuses and RLS', async () => {
    const environment = getEnvironment();
    const tasks = await environment.sequelize.query(
      'SELECT id,project_id,customer_id,title,description,status,due_date,created_at,updated_at FROM public.tasks ORDER BY id',
      { type: QueryTypes.SELECT },
    );
    expect(tasks).toEqual(environment.beforeMigration);
    expect(
      await environment.sequelize.query(
        'SELECT id,stage_id,updated_at FROM public.projects ORDER BY id',
        { type: QueryTypes.SELECT },
      ),
    ).toEqual(environment.beforeProject);
    expect(
      await environment.sequelize.query(
        'SELECT * FROM public.task_status_transitions ORDER BY id',
        { type: QueryTypes.SELECT },
      ),
    ).toEqual(environment.beforeHistory);
    expect(
      (await Task.findAll()).every(
        (task) => task.taskType === TASK_TYPES.GENERAL,
      ),
    ).toBe(true);
    expect(
      (await environment.stages.getAll()).map((stage) => stage.name),
    ).toEqual(['טיוטה', 'ממתין', 'בעבודה', 'להמתין', 'הסתיים']);
    expect((await environment.stages.getInitialStage()).id).toBe(
      PROJECT_STATUS_IDS.DRAFT,
    );
    const rls = await environment.sequelize.query(
      "SELECT relrowsecurity FROM pg_class WHERE oid='public.tasks'::regclass",
      { type: QueryTypes.SELECT },
    );
    expect(rls).toEqual([{ relrowsecurity: true }]);
    const publicGrant = await environment.sequelize.query(
      "SELECT EXISTS (SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE c.oid='public.tasks'::regclass AND a.grantee=0 AND a.privilege_type='SELECT') AS public_select",
      { type: QueryTypes.SELECT },
    );
    expect(publicGrant).toEqual([{ public_select: false }]);
    const defaultValue = await environment.sequelize.query<{
      column_default: string;
    }>(
      "SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='projects' AND column_name='stage_id'",
      { type: QueryTypes.SELECT },
    );
    expect(defaultValue).toHaveLength(1);
    expect(defaultValue[0]?.column_default).toContain(PROJECT_STATUS_IDS.DRAFT);
    await expect(
      environment.sequelize.query(
        "UPDATE public.project_stages SET name='שינוי אסור' WHERE id=$id",
        { bind: { id: PROJECT_STATUS_IDS.DRAFT } },
      ),
    ).rejects.toThrow('Project status definitions are fixed');
  });

  it.each(['פרויקט חדש', 'א'.repeat(FIELD_LENGTHS.PROJECT_NAME)])(
    'atomically creates Draft project, full-name pair and history for valid project name length %s',
    async (name) => {
      const environment = getEnvironment();
      const project = await environment.projects.create(
        environment.projectInput(name),
        environment.creator,
      );
      expect(project.stageId).toBe(PROJECT_STATUS_IDS.DRAFT);
      const tasks = await expectProtectedPair(project.id, name);
      expect(
        tasks.find((task) => task.taskType === TASK_TYPES.QUOTATION)?.title,
      ).toBe(`הצעת מחיר — ${name}`);
      expect(
        tasks.find((task) => task.taskType === TASK_TYPES.PLANNING)?.title,
      ).toBe(`תכנון — ${name}`);
      expect(environment.events.emitAsync).toHaveBeenCalledTimes(1);
    },
  );

  it('creates the pair for a manual apartment and does not backfill its existing parent', async () => {
    const environment = getEnvironment();
    const building = await environment.createLegacyProject('בניין קודם', true);
    const apartment = await environment.projects.createApartment(
      building.id,
      {
        customerId: environment.customer.id,
        customerFloor: 2,
        customerApartment: '17',
        members: [
          { userId: environment.engineer.id, role: USER_ROLES.ENGINEER },
        ],
      },
      environment.creator,
    );
    expect(apartment.stageId).toBe(PROJECT_STATUS_IDS.DRAFT);
    await expectProtectedPair(apartment.id, apartment.name);
    expect(await Task.count({ where: { projectId: building.id } })).toBe(0);
  });

  it('creates exactly one pair for an imported apartment and preserves it on import retry', async () => {
    const environment = getEnvironment();
    const building = await environment.createLegacyProject('בניין ייבוא', true);
    const file = await makeImportFile([IMPORT_ROW]);
    const result = await environment.imports.import(
      building.id,
      file,
      environment.creator,
    );
    expect(result.counts.created).toBe(1);
    const apartment = await Project.findOne({
      where: {
        parentProjectId: building.id,
        customerApartment: IMPORT_ROW.apartment,
      },
    });
    expect(apartment).not.toBeNull();
    if (!apartment) {
      throw new Error('The imported apartment was not persisted');
    }
    expect(apartment.stageId).toBe(PROJECT_STATUS_IDS.DRAFT);
    const tasks = await expectProtectedPair(apartment.id, apartment.name);
    const retry = await environment.imports.import(
      building.id,
      file,
      environment.creator,
    );
    expect(retry.counts.existing).toBe(1);
    expect(retry.counts.created).toBe(0);
    expect(
      (await Task.findAll({ where: { projectId: apartment.id } }))
        .map((task) => task.id)
        .sort(),
    ).toEqual(tasks.map((task) => task.id).sort());
  });

  it('rolls back the real project, member, both task writes and histories when planning persistence fails', async () => {
    const environment = getEnvironment();
    const before = await environment.counts();
    await environment.rejectPlanning();
    await expect(
      environment.projects.create(
        environment.projectInput('פרויקט שנכשל'),
        environment.creator,
      ),
    ).rejects.toThrow('injected planning failure');
    expect(await environment.counts()).toEqual(before);
    expect(environment.events.emitAsync).not.toHaveBeenCalled();
  });

  it('rolls back the real manual apartment, members, tasks and histories when planning persistence fails', async () => {
    const environment = getEnvironment();
    const building = await environment.createLegacyProject('בניין שנשמר', true);
    const before = await environment.counts();
    await environment.rejectPlanning();
    await expect(
      environment.projects.createApartment(
        building.id,
        {
          customerId: environment.customer.id,
          customerFloor: 2,
          customerApartment: '29',
          members: [
            {
              userId: environment.engineer.id,
              role: USER_ROLES.ENGINEER,
            },
          ],
        },
        environment.creator,
      ),
    ).rejects.toThrow('injected planning failure');
    expect(await environment.counts()).toEqual(before);
    expect(environment.events.emitAsync).not.toHaveBeenCalled();
  });

  it('rolls back imported customer, contacts, apartment and task/history writes together on mandatory task failure', async () => {
    const environment = getEnvironment();
    const building = await environment.createLegacyProject(
      'בניין ייבוא שנכשל',
      true,
    );
    const before = await environment.counts();
    await environment.rejectPlanning();
    const row = {
      ...IMPORT_ROW,
      customerTaxId: '000000026',
      customerName: 'לקוח שיבוטל',
    };
    const result = await environment.imports.import(
      building.id,
      await makeImportFile([row]),
      environment.creator,
    );
    expect(result.counts.error).toBe(1);
    expect(result.counts.created).toBe(0);
    expect(await environment.counts()).toEqual(before);
    expect(environment.events.emitAsync).not.toHaveBeenCalled();
  });

  it('serializes simultaneous initialization and preserves completed task IDs/history on retry', async () => {
    const environment = getEnvironment();
    const project = await environment.createLegacyProject('פרויקט תחרות');
    await Promise.all(
      [1, 2, 3].map(() =>
        environment.transactions.run((transaction) =>
          environment.initialize.ensureForProject(
            project,
            environment.creator,
            transaction,
          ),
        ),
      ),
    );
    const tasks = await expectProtectedPair(project.id, project.name);
    const quote = tasks.find((task) => task.taskType === TASK_TYPES.QUOTATION);
    if (!quote) {
      throw new Error('The quotation task was not persisted');
    }
    await quote.update({ status: TASK_STATUSES.PROPOSAL_SENT });
    await TaskStatusTransition.create({
      taskId: quote.id,
      fromStatus: TASK_STATUSES.NOT_STARTED,
      toStatus: TASK_STATUSES.PROPOSAL_SENT,
      changedById: environment.creator.id,
    });
    await environment.transactions.run((transaction) =>
      environment.initialize.ensureForProject(
        project,
        environment.creator,
        transaction,
      ),
    );
    expect(
      (await Task.findAll({ where: { projectId: project.id } }))
        .map((task) => task.id)
        .sort(),
    ).toEqual(tasks.map((task) => task.id).sort());
    expect((await Task.findByPk(quote.id))?.status).toBe(
      TASK_STATUSES.PROPOSAL_SENT,
    );
    expect(
      await TaskStatusTransition.count({ where: { taskId: quote.id } }),
    ).toBe(2);
  });

  it('enforces protected lifetime uniqueness at the DB boundary, including completion/archive, while allowing general duplicates', async () => {
    const environment = getEnvironment();
    const project = await environment.createLegacyProject('פרויקט גבול DB');
    const attributes = toProjectTaskAttributes(
      project,
      environment.creator.id,
      TASK_TYPES.QUOTATION,
    );
    const results = await Promise.allSettled([
      Task.create(attributes),
      Task.create(attributes),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    const reason: unknown = rejected?.reason;
    expect(reason).toBeInstanceOf(UniqueConstraintError);
    const quote = await Task.findOne({ where: { projectId: project.id } });
    if (!quote) {
      throw new Error('The quotation task was not persisted');
    }
    await quote.update({ status: TASK_STATUSES.PROPOSAL_SENT });
    await expect(Task.create(attributes)).rejects.toBeInstanceOf(
      UniqueConstraintError,
    );
    await quote.destroy();
    await expect(Task.create(attributes)).rejects.toBeInstanceOf(
      UniqueConstraintError,
    );
    const general = { ...attributes, taskType: TASK_TYPES.GENERAL };
    await Promise.all([Task.create(general), Task.create(general)]);
    expect(
      await Task.count({
        where: { projectId: project.id, taskType: TASK_TYPES.GENERAL },
      }),
    ).toBe(2);
  });

  it('requires a project-only association for protected rows without rejecting retained general customer-only rows', async () => {
    const environment = getEnvironment();
    const attributes = toProjectTaskAttributes(
      environment.legacyProject,
      environment.creator.id,
      TASK_TYPES.PLANNING,
    );
    await expect(
      Task.create({
        ...attributes,
        projectId: null,
        customerId: environment.customer.id,
      }),
    ).rejects.toThrow();
    await expect(
      Task.create({ ...attributes, customerId: environment.customer.id }),
    ).rejects.toThrow();
    expect(
      (await Task.findByPk(environment.legacyCustomerTaskId))?.customerId,
    ).toBe(environment.customer.id);
    expect((await Task.findByPk(environment.legacyDualTaskId))?.projectId).toBe(
      environment.legacyProject.id,
    );
  });
});
