import {
  TProjectNameLightingEnvironment,
  createProjectNameLightingEnvironment,
} from './project-name-lighting.fixture';

import { QueryTypes } from 'sequelize';
import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { Project } from '@Modules/project/entities/project.entity';
import { PROJECT_STATUS_IDS } from '@Constants/project-status.constant';
import { PROJECT_NAME } from '@Modules/project/constants/project-name.constant';

interface IProjectNameRow {
  id: string;
  name: string;
}

const readNames = (environment: TProjectNameLightingEnvironment) =>
  environment.sequelize.query<IProjectNameRow>(
    'SELECT id, name FROM public.projects ORDER BY id',
    { type: QueryTypes.SELECT },
  );

const projectAttributes = (
  environment: TProjectNameLightingEnvironment,
  name: string,
) => ({
  ...environment.legacyProject.get({ plain: true }),
  id: randomUUID(),
  name,
  code: randomUUID().slice(0, 8),
  customerId: environment.customer.id,
  projectTypeId: environment.legacyProject.projectTypeId,
  stageId: PROJECT_STATUS_IDS.WAITING,
  createdById: environment.creator.id,
});

const assertRejectedOutcome = (
  result: PromiseSettledResult<unknown> | null,
) => {
  if (!result) {
    throw new Error('Expected one rejected competing write.');
  }
  expect(result.status).toBe('rejected');
  if (result.status !== 'rejected') {
    throw new Error('Expected the competing write to reject.');
  }
  const reason: unknown = result.reason;
  expect(reason).toBeInstanceOf(ConflictException);
  if (!(reason instanceof ConflictException)) {
    throw new Error('Expected a domain conflict.');
  }
  expect(reason.getStatus()).toBe(409);
  expect(reason.getResponse()).toMatchObject({
    code: 'PROJECT_NAME_ALREADY_EXISTS',
  });
};

describe('project-name migration preflight on real PostgreSQL', () => {
  it('fails atomically on normalized duplicates without renaming or deleting records', async () => {
    const environment = await createProjectNameLightingEnvironment();
    try {
      await environment.seedRaw('  Existing duplicate\u00a0');
      await environment.seedRaw('Existing duplicate');
      const before = await readNames(environment);
      await expect(environment.applyMigration()).rejects.toThrow(
        'Active project names conflict after outer-space trimming',
      );
      await environment.sequelize.query('ROLLBACK');
      expect(await readNames(environment)).toEqual(before);
      const columns = await environment.sequelize.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'projects' AND column_name LIKE '%general_lighting%'",
        { type: QueryTypes.SELECT },
      );
      expect(columns).toEqual([]);
      const indexes = await environment.sequelize.query(
        "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = $index",
        { type: QueryTypes.SELECT, bind: { index: PROJECT_NAME.UNIQUE_INDEX } },
      );
      expect(indexes).toEqual([]);
    } finally {
      await environment.close();
    }
  });

  it('backfills existing projects to disabled/null without altering names', async () => {
    const environment = await createProjectNameLightingEnvironment();
    try {
      const id = await environment.seedRaw('  Preserve existing name  ');
      const before = await readNames(environment);
      await environment.applyMigration();
      expect(await readNames(environment)).toEqual(before);
      const record = await Project.findByPk(id);
      expect(record?.hasGeneralLightingCeilingLowering).toBe(false);
      expect(record?.generalLightingCeilingLoweringHeight).toBeNull();
      const indexes = await environment.sequelize.query<{
        indisvalid: boolean;
      }>(
        'SELECT indisvalid FROM pg_index JOIN pg_class ON pg_class.oid = pg_index.indexrelid WHERE relname = $index',
        { type: QueryTypes.SELECT, bind: { index: PROJECT_NAME.UNIQUE_INDEX } },
      );
      expect(indexes).toEqual([{ indisvalid: true }]);
    } finally {
      await environment.close();
    }
  });
});

describe('exact project names and lighting against real PostgreSQL', () => {
  const context: { environment: TProjectNameLightingEnvironment | null } = {
    environment: null,
  };
  const getEnvironment = () => {
    if (!context.environment) {
      throw new Error('The isolated project database is not initialized.');
    }
    return context.environment;
  };

  beforeAll(async () => {
    context.environment = await createProjectNameLightingEnvironment();
    await context.environment.applyMigration();
  });
  afterAll(async () => {
    await context.environment?.close();
  });

  it('blocks exact duplicates independently of customer and parent relations', async () => {
    const environment = getEnvironment();
    await environment.repository.create(
      projectAttributes(environment, 'Exact name'),
    );
    await expect(
      environment.repository.create({
        ...projectAttributes(environment, 'Exact name'),
        customerId: null,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await Project.count({ where: { name: 'Exact name' } })).toBe(1);
  });

  it('enforces global apartment names across buildings and root projects', async () => {
    const environment = getEnvironment();
    const buildings = await Promise.all([
      environment.createLegacyProject('Global building A', true),
      environment.createLegacyProject('Global building B', true),
    ]);
    await environment.repository.create({
      ...projectAttributes(environment, 'Global apartment'),
      parentProjectId: buildings[0].id,
    });
    await expect(
      environment.repository.create({
        ...projectAttributes(environment, 'Global apartment'),
        parentProjectId: buildings[1].id,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      environment.repository.create(
        projectAttributes(environment, 'Global apartment'),
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('preserves case and internal whitespace rather than broad similarity matching', async () => {
    const environment = getEnvironment();
    const names = ['Case Project', 'case project', 'Case  Project'];
    await Promise.all(
      names.map((name) =>
        environment.repository.create(projectAttributes(environment, name)),
      ),
    );
    for (const name of names) {
      expect(await environment.repository.isNameAvailable(name, null)).toBe(
        false,
      );
    }
  });

  it('matches every JS outer-whitespace character in the SQL expression index', async () => {
    const environment = getEnvironment();
    await environment.repository.create(
      projectAttributes(environment, 'Whitespace target'),
    );
    const characters = [...PROJECT_NAME.TRIM_CHARACTERS];
    expect(characters.length).toBe(25);
    for (const character of characters) {
      const padded = `${character}Whitespace target${character}`;
      expect(padded.trim()).toBe('Whitespace target');
      await expect(environment.seedRaw(padded)).rejects.toThrow();
      expect(await environment.repository.isNameAvailable(padded, null)).toBe(
        false,
      );
    }
  });

  it('keeps distinct Unicode compositions distinct under deterministic C collation', async () => {
    const environment = getEnvironment();
    await environment.repository.create(projectAttributes(environment, 'café'));
    await environment.repository.create(
      projectAttributes(environment, 'cafe\u0301'),
    );
    expect(
      await Project.count({ where: { name: ['café', 'cafe\u0301'] } }),
    ).toBe(2);
  });

  it('allows an unchanged own name while identifying another active project as a conflict', async () => {
    const environment = getEnvironment();
    const record = await environment.repository.create(
      projectAttributes(environment, 'Own name'),
    );
    expect(
      await environment.repository.isNameAvailable('Own name', record.id),
    ).toBe(true);
    expect(
      await environment.repository.isNameAvailable('Own name', randomUUID()),
    ).toBe(false);
    await expect(
      environment.repository.update(record.id, { name: 'Own name' }),
    ).resolves.toBe(true);
  });

  it('permits reuse after soft deletion and prevents restoring the conflicting old record', async () => {
    const environment = getEnvironment();
    const oldRecord = await environment.repository.create(
      projectAttributes(environment, 'Reusable name'),
    );
    await oldRecord.destroy();
    expect(
      await environment.repository.isNameAvailable('Reusable name', null),
    ).toBe(true);
    await environment.repository.create(
      projectAttributes(environment, 'Reusable name'),
    );
    await expect(oldRecord.restore()).rejects.toThrow();
    expect(await Project.count({ where: { name: 'Reusable name' } })).toBe(1);
  });

  it('allows only one concurrent exact-name create and returns a domain conflict for the loser', async () => {
    const environment = getEnvironment();
    const outcomes = await Promise.allSettled([
      environment.repository.create(
        projectAttributes(environment, 'Create race'),
      ),
      environment.repository.create(
        projectAttributes(environment, 'Create race'),
      ),
    ]);
    expect(
      outcomes.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    assertRejectedOutcome(
      outcomes.find((result) => result.status === 'rejected')!,
    );
    expect(await Project.count({ where: { name: 'Create race' } })).toBe(1);
  });

  it('allows only one concurrent rename to a shared target', async () => {
    const environment = getEnvironment();
    const records = await Promise.all([
      environment.repository.create(
        projectAttributes(environment, 'Rename source A'),
      ),
      environment.repository.create(
        projectAttributes(environment, 'Rename source B'),
      ),
    ]);
    const outcomes = await Promise.allSettled(
      records.map((record) =>
        environment.repository.update(record.id, { name: 'Rename target' }),
      ),
    );
    expect(
      outcomes.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    assertRejectedOutcome(
      outcomes.find((result) => result.status === 'rejected')!,
    );
    expect(await Project.count({ where: { name: 'Rename target' } })).toBe(1);
  });

  it.each([0, 25.125])(
    'persists and reads finite lighting height %s as a number',
    async (height) => {
      const environment = getEnvironment();
      const record = await environment.repository.create({
        ...projectAttributes(environment, `Height ${height}`),
        hasGeneralLightingCeilingLowering: true,
        generalLightingCeilingLoweringHeight: height,
      });
      const reloaded = await Project.findByPk(record.id);
      expect(reloaded?.generalLightingCeilingLoweringHeight).toBe(height);
      expect(typeof reloaded?.generalLightingCeilingLoweringHeight).toBe(
        'number',
      );
    },
  );

  it.each([null, -1, 'Infinity', '-Infinity', 'NaN'])(
    'rejects enabled invalid database height %s',
    async (height) => {
      const environment = getEnvironment();
      const id = await environment.seedRaw(`Invalid height ${String(height)}`);
      await expect(
        environment.sequelize.query(
          'UPDATE public.projects SET has_general_lighting_ceiling_lowering = true, general_lighting_ceiling_lowering_height = $height::double precision WHERE id = $id',
          { bind: { height, id } },
        ),
      ).rejects.toThrow();
      const record = await Project.findByPk(id);
      expect(record?.hasGeneralLightingCeilingLowering).toBe(false);
      expect(record?.generalLightingCeilingLoweringHeight).toBeNull();
    },
  );

  it('rejects a saved height when disabled and permits clearing both fields atomically', async () => {
    const environment = getEnvironment();
    const id = await environment.seedRaw('Disabled height');
    await expect(
      environment.sequelize.query(
        'UPDATE public.projects SET general_lighting_ceiling_lowering_height = 5 WHERE id = $id',
        { bind: { id } },
      ),
    ).rejects.toThrow();
    await Project.update(
      {
        hasGeneralLightingCeilingLowering: true,
        generalLightingCeilingLoweringHeight: 20,
      },
      { where: { id } },
    );
    await Project.update(
      {
        hasGeneralLightingCeilingLowering: false,
        generalLightingCeilingLoweringHeight: null,
      },
      { where: { id } },
    );
    expect(
      (await Project.findByPk(id))?.generalLightingCeilingLoweringHeight,
    ).toBeNull();
  });
});
