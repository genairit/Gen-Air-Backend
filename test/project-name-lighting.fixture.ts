import {
  TProjectTaskEnvironment,
  createProjectTaskEnvironment,
} from './project-task-initialization.fixture';

import { resolve } from 'node:path';
import { QueryTypes } from 'sequelize';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { ProjectRepository } from '@Modules/project/project.repository';
import { PROJECT_STATUS_IDS } from '@Constants/project-status.constant';

export const PROJECT_NAME_LIGHTING_MIGRATION = resolve(
  __dirname,
  '../migrations/2026-10-31-project-name-uniqueness-and-lighting.sql',
);

export const createProjectNameLightingEnvironment = async () => {
  const base = await createProjectTaskEnvironment();
  try {
    await base.sequelize.query(
      'ALTER TABLE public.projects DROP COLUMN has_general_lighting_ceiling_lowering, DROP COLUMN general_lighting_ceiling_lowering_height',
    );
    const migration = await readFile(PROJECT_NAME_LIGHTING_MIGRATION, 'utf8');
    return {
      ...base,
      migration,
      repository: new ProjectRepository(),
      applyMigration: () => base.sequelize.query(migration),
      seedRaw: (name: string) => seedRawProject(base, name),
    };
  } catch (error) {
    await base.close();
    throw error;
  }
};

const seedRawProject = async (base: TProjectTaskEnvironment, name: string) => {
  const id = randomUUID();
  await base.sequelize.query(
    `INSERT INTO public.projects (id, code, name, project_type_id, stage_id, created_by_id, customer_id, created_at, updated_at)
     VALUES ($id, $code, $name, $typeId, $stageId, $creatorId, $customerId, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    {
      bind: {
        id,
        name,
        code: randomUUID().slice(0, 8),
        typeId: base.legacyProject.projectTypeId,
        stageId: PROJECT_STATUS_IDS.WAITING,
        creatorId: base.creator.id,
        customerId: base.customer.id,
      },
      type: QueryTypes.INSERT,
    },
  );
  return id;
};

export type TProjectNameLightingEnvironment = Awaited<
  ReturnType<typeof createProjectNameLightingEnvironment>
>;
