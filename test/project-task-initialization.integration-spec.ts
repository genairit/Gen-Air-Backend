import {
  TProjectTaskEnvironment,
  createProjectTaskEnvironment,
} from './project-task-initialization.fixture';

import {
  IMPORT_ROW,
  makeImportFile,
} from '@Modules/project/testing/apartment-import.fixture';

import { ConflictException } from '@nestjs/common';
import { Task } from '@Modules/task/entities/task.entity';
import { USER_ROLES } from '@Constants/user-role.constant';
import { QueryTypes, UniqueConstraintError } from 'sequelize';
import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { Project } from '@Modules/project/entities/project.entity';
import { TASK_TYPES } from '@Modules/task/constants/task-type.constant';
import { PROJECT_STATUS_IDS } from '@Constants/project-status.constant';
import { TASK_STATUSES } from '@Modules/task/constants/task-status.constant';
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

const expectNoTasks = async (projectId: string) => {
  expect(await Task.count({ where: { projectId } })).toBe(0);
};

describe('explicit project tasks against isolated PostgreSQL', () => {
  beforeAll(async () => {
    state.environment = await createProjectTaskEnvironment();
  });
  afterAll(async () => {
    await state.environment?.close();
  });
  beforeEach(() => {
    getEnvironment().events.emitAsync.mockClear();
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
    ).toEqual(['טרם בעבודה', 'בעבודה', 'מחכה לתשובה', 'הושלם']);
    expect((await environment.stages.getInitialStage()).id).toBe(
      PROJECT_STATUS_IDS.NOT_STARTED,
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
    expect(defaultValue[0]?.column_default).toContain(
      PROJECT_STATUS_IDS.NOT_STARTED,
    );
    await expect(
      environment.sequelize.query(
        "UPDATE public.project_stages SET name='שינוי אסור' WHERE id=$id",
        { bind: { id: PROJECT_STATUS_IDS.NOT_STARTED } },
      ),
    ).rejects.toThrow('Project status definitions are fixed');
  });

  it.each(['פרויקט חדש', 'א'.repeat(FIELD_LENGTHS.PROJECT_NAME)])(
    'creates a standalone project without tasks for valid name length %s',
    async (name) => {
      const environment = getEnvironment();
      const project = await environment.projects.create(
        environment.projectInput(name),
        environment.creator,
      );
      expect(project.stageId).toBe(PROJECT_STATUS_IDS.NOT_STARTED);
      await expectNoTasks(project.id);
      expect(environment.events.emitAsync).toHaveBeenCalledTimes(1);
    },
  );

  it('creates a building and its manual apartment without protected tasks', async () => {
    const environment = getEnvironment();
    const building = await environment.projects.create(
      {
        ...environment.projectInput('בניין חדש', environment.buildingTypeId),
        members: [],
      },
      environment.creator,
    );
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
    await expectNoTasks(building.id);
    await expectNoTasks(apartment.id);
  });

  it('imports an apartment without tasks and leaves it unchanged on retry', async () => {
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
      throw new Error('The apartment was not persisted');
    }
    await expectNoTasks(apartment.id);
    const retry = await environment.imports.import(
      building.id,
      file,
      environment.creator,
    );
    expect(retry.counts.existing).toBe(1);
    expect(retry.counts.created).toBe(0);
    await expectNoTasks(apartment.id);
  });

  it('explicitly creates one quotation and one planning task with separate history', async () => {
    const environment = getEnvironment();
    const project = await environment.projects.create(
      environment.projectInput('פרויקט משימות'),
      environment.creator,
    );
    for (const taskType of [TASK_TYPES.QUOTATION, TASK_TYPES.PLANNING]) {
      const task = await environment.tasks.create(
        {
          taskType,
          projectId: project.id,
          title: `${taskType} — ${project.name}`,
          description: `Work on ${taskType}`,
        },
        environment.taskActor,
      );
      expect(task.taskType).toBe(taskType);
      expect(task.projectId).toBe(project.id);
      expect(task.customerId).toBeNull();
      expect(task.status).toBe(TASK_STATUSES.NOT_STARTED);
      expect(
        await TaskStatusTransition.count({ where: { taskId: task.id } }),
      ).toBe(1);
    }
    expect(await Task.count({ where: { projectId: project.id } })).toBe(2);
  });

  it('blocks concurrent duplicates and preserves the first task ID and history', async () => {
    const environment = getEnvironment();
    const project = await environment.createLegacyProject('פרויקט תחרות');
    const input = {
      taskType: TASK_TYPES.QUOTATION,
      projectId: project.id,
      title: 'הצעת מחיר לפרויקט תחרות',
      description: 'הכנת הצעת מחיר',
    };
    const results = await Promise.allSettled([
      environment.tasks.create(input, environment.taskActor),
      environment.tasks.create(input, environment.taskActor),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected?.reason).toBeInstanceOf(ConflictException);
    if (rejected?.reason instanceof ConflictException) {
      expect(rejected.reason.getStatus()).toBe(409);
    }
    const task = await Task.findOne({ where: { projectId: project.id } });
    if (!task) {
      throw new Error('The quotation task was not persisted');
    }
    await environment.tasks.updateStatus(
      task.id,
      TASK_STATUSES.PROPOSAL_SENT,
      environment.taskActor,
    );
    await expect(
      environment.tasks.create(input, environment.taskActor),
    ).rejects.toBeInstanceOf(ConflictException);
    expect((await Task.findByPk(task.id))?.status).toBe(
      TASK_STATUSES.PROPOSAL_SENT,
    );
    expect(
      await TaskStatusTransition.count({ where: { taskId: task.id } }),
    ).toBe(2);
    await expect(
      environment.tasks.delete(task.id, environment.taskActor),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('keeps lifetime uniqueness at the DB boundary while allowing General duplicates', async () => {
    const environment = getEnvironment();
    const project = await environment.createLegacyProject('פרויקט גבול DB');
    const attributes = {
      taskType: TASK_TYPES.QUOTATION,
      projectId: project.id,
      customerId: null,
      createdById: environment.creator.id,
      assigneeId: null,
      title: 'הצעת מחיר',
      description: 'הכנת הצעת מחיר',
      dueDate: null,
    };
    const first = await Task.create(attributes);
    await expect(Task.create(attributes)).rejects.toBeInstanceOf(
      UniqueConstraintError,
    );
    await first.destroy();
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

  it('preserves legacy customer-only tasks and rejects invalid protected association', async () => {
    const environment = getEnvironment();
    const attributes = {
      taskType: TASK_TYPES.PLANNING,
      projectId: environment.legacyProject.id,
      customerId: null,
      createdById: environment.creator.id,
      assigneeId: null,
      title: 'תכנון',
      description: 'הכנת תכנון',
      dueDate: null,
    };
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
