import { randomUUID } from 'node:crypto';
import { mock } from 'jest-mock-extended';
import { QuotationController } from './quotation.controller';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { DEFAULT_VAT_RATE } from './constants/quotation.constant';
import { getHttpErrorResponse } from '@Utilities/http-error.utility';
import { HTTP_ERROR_CODES } from '@Constants/http-error-code.constant';
import { TaskQuotationFixture } from './testing/task-quotation.fixture';
import { getHttpErrorPayload } from '@Utilities/http-error-payload.utility';
import { taskQuotationSaveInput } from './testing/task-quotation-save.fixture';
import { QUOTATION_RULE_KEYS } from '@Modules/quotation-rule/constants/quotation-rule.constant';

const fixture = new TaskQuotationFixture();
const { taskId, customerId, projectId, actor } = fixture;
const database = () => fixture.database();
const links = () => fixture.links();
const service = () => fixture.service();
beforeAll(() => fixture.start(), 30000);
afterAll(() => fixture.close());
beforeEach(() => fixture.reset());
it('serializes concurrent creates and response-loss retries to one durable primary', async () => {
  const current = service();
  const results = await Promise.all(
    Array.from({ length: 5 }, () => current.createForTask(taskId, actor)),
  );
  expect(new Set(results.map((row) => row.quotationId)).size).toBe(1);
  expect(results.filter((row) => row.created)).toHaveLength(1);
  expect(await current.createForTask(taskId, actor)).toEqual({
    quotationId: results[0].quotationId,
    created: false,
  });
});
it('rolls draft and project association back if link insertion fails', async () => {
  const current = service();
  await database().query(
    "CREATE FUNCTION reject_link() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test rollback'; END $$;CREATE TRIGGER reject_link BEFORE INSERT ON task_quotation_links FOR EACH ROW EXECUTE FUNCTION reject_link()",
  );
  try {
    await expect(current.createForTask(taskId, actor)).rejects.toThrow(
      'test rollback',
    );
    const [rows] = await database().query('SELECT id FROM quotations');
    expect(rows).toHaveLength(0);
    const [projects] = await database().query(
      'SELECT * FROM quotation_projects',
    );
    expect(projects).toHaveLength(0);
  } finally {
    await database().query(
      'DROP TRIGGER reject_link ON task_quotation_links;DROP FUNCTION reject_link()',
    );
  }
});
it('rejects linked customer/project changes while retaining deleted task documents', async () => {
  const result = await service().createForTask(taskId, actor);
  await expect(
    database().query(
      'UPDATE quotations SET customer_id=$id WHERE id=$quotationId',
      { bind: { id: randomUUID(), quotationId: result.quotationId } },
    ),
  ).rejects.toThrow('Linked task quotation context cannot change');
  await database().query('UPDATE tasks SET deleted_at=now() WHERE id=$taskId', {
    bind: { taskId },
  });
  try {
    const metadata = await links().metadata(result.quotationId, actor);
    expect(metadata.taskContextLocked).toBe(true);
    expect(metadata.taskLinks).toEqual([]);
    expect(
      (await database().query('SELECT id FROM quotations'))[0],
    ).toHaveLength(1);
  } finally {
    await database().query(
      'UPDATE tasks SET deleted_at=NULL WHERE id=$taskId',
      { bind: { taskId } },
    );
  }
});
it('allows readers to reopen but requires create permission for a new draft', async () => {
  const reader = {
    ...actor,
    permissions: actor.permissions.filter(
      (value) => value !== PERMISSIONS.QUOTATIONS_CREATE,
    ),
  };
  const current = service();
  await expect(current.createForTask(taskId, reader)).rejects.toThrow(
    'permission',
  );
  const first = await current.createForTask(taskId, actor);
  expect(await current.createForTask(taskId, reader)).toEqual({
    quotationId: first.quotationId,
    created: false,
  });
  expect(
    (await links().metadata(first.quotationId, { ...actor, permissions: [] }))
      .taskLinks,
  ).toEqual([]);
});
it('supports legacy customer-only tasks while blocking missing direct customer and wrong task type', async () => {
  const current = service();
  await database().query(
    'UPDATE tasks SET project_id=NULL,customer_id=$customerId WHERE id=$taskId',
    { bind: { taskId, customerId } },
  );
  try {
    const result = await current.createForTask(taskId, actor);
    expect(result.created).toBe(true);
    expect(
      (await database().query('SELECT * FROM quotation_projects'))[0],
    ).toHaveLength(0);
  } finally {
    await database().query('TRUNCATE task_quotation_links,quotations');
    await database().query(
      'UPDATE tasks SET project_id=$projectId,customer_id=NULL WHERE id=$taskId',
      { bind: { projectId, taskId } },
    );
  }
  await database().query(
    'UPDATE projects SET customer_id=NULL WHERE id=$projectId',
    { bind: { projectId } },
  );
  try {
    await expect(current.createForTask(taskId, actor)).rejects.toThrow(
      'context is unavailable',
    );
    expect((await links().read(taskId, actor)).unavailableReason).toBe(
      'MISSING_CONTEXT',
    );
  } finally {
    await database().query(
      'UPDATE projects SET customer_id=$customerId WHERE id=$projectId',
      { bind: { customerId, projectId } },
    );
  }
  await database().query(
    "UPDATE tasks SET task_type='general' WHERE id=$taskId",
    { bind: { taskId } },
  );
  try {
    await expect(current.createForTask(taskId, actor)).rejects.toThrow(
      'context is unavailable',
    );
  } finally {
    await database().query(
      "UPDATE tasks SET task_type='quotation' WHERE id=$taskId",
      { bind: { taskId } },
    );
  }
});
it('restricts public Data API access and enforces one primary per task', async () => {
  await service().createForTask(taskId, actor);
  const [rows] = await database().query(
    "SELECT relrowsecurity,has_table_privilege('anon','task_quotation_links','SELECT') AS anon_read,has_table_privilege('authenticated','task_quotation_links','INSERT') AS authenticated_write FROM pg_class WHERE relname='task_quotation_links'",
  );
  expect(rows).toEqual([
    { relrowsecurity: true, anon_read: false, authenticated_write: false },
  ]);
});
it('preserves readable existing documents without customer or project read, while blocking new creation', async () => {
  const current = service();
  const reader = {
    ...actor,
    permissions: [PERMISSIONS.TASKS_READ, PERMISSIONS.QUOTATIONS_READ],
  };
  await expect(current.createForTask(taskId, reader)).rejects.toThrow(
    'permission',
  );
  const first = await current.createForTask(taskId, actor);
  const context = await links().read(taskId, reader);
  expect(context.quotations.map((row) => row.id)).toEqual([first.quotationId]);
  expect(context.customerId).toBeNull();
  expect(context.projectId).toBeNull();
  expect(context.canCreate).toBe(false);
  expect(
    (
      await links().read(taskId, {
        ...reader,
        permissions: [...reader.permissions, PERMISSIONS.QUOTATIONS_CREATE],
      })
    ).canCreate,
  ).toBe(false);
  expect(await current.createForTask(taskId, reader)).toEqual({
    quotationId: first.quotationId,
    created: false,
  });
});
it('creates customer-only legacy quotation without project read permission', async () => {
  const creator = {
    ...actor,
    permissions: actor.permissions.filter(
      (permission) => permission !== PERMISSIONS.PROJECTS_READ,
    ),
  };
  await database().query(
    'UPDATE tasks SET project_id=NULL,customer_id=$customerId WHERE id=$taskId',
    { bind: { customerId, taskId } },
  );
  try {
    expect((await links().read(taskId, creator)).canCreate).toBe(true);
    expect((await service().createForTask(taskId, creator)).created).toBe(true);
  } finally {
    await database().query('TRUNCATE task_quotation_links,quotations');
    await database().query(
      'UPDATE tasks SET project_id=$projectId,customer_id=NULL WHERE id=$taskId',
      { bind: { projectId, taskId } },
    );
  }
});
it('runs the normal initializer with project and sales agent under a saturated connection pool', async () => {
  const current = service();
  const results = await Promise.all(
    Array.from({ length: 8 }, () =>
      current.create({ customerId, projectId, salesAgentId: actor.id }, actor),
    ),
  );
  expect(new Set(results.map((row) => row.id)).size).toBe(8);
  expect(new Set(results.map((row) => row.number)).size).toBe(8);
  for (const result of results) {
    expect(result).toMatchObject({
      customerId,
      projectId,
      salesAgentId: actor.id,
      status: 'draft',
      paymentTerms: 'prepaid',
      paymentSchedule: [],
      issuerName: 'Quotation Engineer',
      createdById: actor.id,
    });
    expect(Number(result.vatRate)).toBe(Number(DEFAULT_VAT_RATE));
    expect(result.sections).toEqual([]);
    expect(result.ruleConfiguration).toHaveLength(QUOTATION_RULE_KEYS.length);
  }
  expect(await links().list(taskId)).toEqual([]);
}, 15000);
it('keeps reader Open available after project or customer deletion and forbids fresh drafts until context returns', async () => {
  const current = service();
  const first = await current.createForTask(taskId, actor);
  const reader = {
    ...actor,
    permissions: [PERMISSIONS.TASKS_READ, PERMISSIONS.QUOTATIONS_READ],
  };
  for (const table of ['projects', 'customers']) {
    const id = table === 'projects' ? projectId : customerId;
    await database().query(
      `UPDATE ${table} SET deleted_at=now() WHERE id=$id`,
      { bind: { id } },
    );
    try {
      expect(
        (await links().read(taskId, reader)).quotations.map((row) => row.id),
      ).toEqual([first.quotationId]);
      expect(await current.createForTask(taskId, reader)).toEqual({
        quotationId: first.quotationId,
        created: false,
      });
    } finally {
      await database().query(
        `UPDATE ${table} SET deleted_at=NULL WHERE id=$id`,
        { bind: { id } },
      );
    }
  }
  const quotation = await current.getById(first.quotationId);
  await current.delete(quotation.id, { version: quotation.version }, actor.id);
  await database().query(
    'UPDATE projects SET deleted_at=now() WHERE id=$projectId',
    { bind: { projectId } },
  );
  try {
    await expect(current.createForTask(taskId, actor)).rejects.toThrow(
      'context is unavailable',
    );
  } finally {
    await database().query(
      'UPDATE projects SET deleted_at=NULL WHERE id=$projectId',
      { bind: { projectId } },
    );
  }
  const replacement = await current.createForTask(taskId, actor);
  expect(replacement.created).toBe(true);
  expect(replacement.quotationId).not.toBe(first.quotationId);
  expect(
    (await database().query('SELECT * FROM task_quotation_links'))[0],
  ).toHaveLength(2);
});
it('clones a secondary through the real clone path, protects save context and returns actor-filtered mutation metadata', async () => {
  const current = service();
  const controller = new QuotationController(current, mock());
  const first = await current.createForTask(taskId, actor);
  const draft = await current.getById(first.quotationId);
  const branded = await controller.save(
    draft.id,
    taskQuotationSaveInput(draft, {
      brand: 'אלקטרה',
      brands: ['אלקטרה'],
      sections: [
        {
          id: randomUUID(),
          title: 'Single system',
          brand: 'אלקטרה',
          systemType: 'SINGLE',
          items: [],
        },
      ],
    }),
    actor,
  );
  expect(branded.taskLinks).toEqual([
    { taskId, title: 'Quotation task', isPrimary: true },
  ]);
  const secondary = await controller.clone(
    branded.id,
    { sourceVersion: branded.version, targetBrand: 'תדיראן', mappings: [] },
    actor,
  );
  const third = await controller.clone(
    secondary.id,
    { sourceVersion: secondary.version, targetBrand: 'אלקטרה', mappings: [] },
    actor,
  );
  expect(secondary.taskLinks).toEqual([
    { taskId, title: 'Quotation task', isPrimary: false },
  ]);
  expect(third.taskLinks).toEqual(secondary.taskLinks);
  expect((await links().list(taskId)).find((row) => row.isPrimary)?.id).toBe(
    first.quotationId,
  );
  const otherProject = randomUUID();
  await database().query(
    'INSERT INTO projects(id,customer_id) VALUES ($id,$customerId)',
    { bind: { id: otherProject, customerId } },
  );
  await expect(
    controller.save(
      third.id,
      taskQuotationSaveInput(third, { projectId: otherProject }),
      actor,
    ),
  ).rejects.toMatchObject({
    status: 409,
    response: { code: HTTP_ERROR_CODES.TASK_QUOTATION_CONTEXT_LOCKED },
  });
  const noTasks = {
    ...actor,
    permissions: actor.permissions.filter(
      (permission) => permission !== PERMISSIONS.TASKS_READ,
    ),
  };
  const saved = await controller.save(
    third.id,
    taskQuotationSaveInput(third, {
      internalNotes: 'Saved without task disclosure',
    }),
    noTasks,
  );
  expect(saved).toMatchObject({
    taskContextLocked: true,
    taskProjectLocked: true,
    taskLinks: [],
    internalNotes: 'Saved without task disclosure',
  });
  await current.delete(branded.id, { version: branded.version }, actor.id);
  await current.delete(secondary.id, { version: secondary.version }, actor.id);
  expect(await current.createForTask(taskId, actor)).toEqual({
    quotationId: third.id,
    created: false,
  });
  expect((await links().list(taskId))[0].isPrimary).toBe(true);
});
it('maps only the named deferred context constraint to409 for project customer and primary link edits', async () => {
  const current = service();
  const first = await current.createForTask(taskId, actor);
  const otherCustomer = randomUUID();
  const otherProject = randomUUID();
  await database().query(
    'INSERT INTO projects(id,customer_id) VALUES ($id,$customerId)',
    { bind: { id: otherProject, customerId } },
  );
  const projectError = await database()
    .transaction((transaction) =>
      database().query(
        'UPDATE projects SET customer_id=$otherCustomer WHERE id=$projectId',
        { bind: { otherCustomer, projectId }, transaction },
      ),
    )
    .then(
      () => null,
      (error: unknown) => error,
    );
  expect(getHttpErrorResponse(projectError)).toEqual({
    statusCode: 409,
    ...getHttpErrorPayload(HTTP_ERROR_CODES.TASK_QUOTATION_CONTEXT_LOCKED),
  });
  const linkError = await database()
    .transaction((transaction) =>
      database().query(
        'UPDATE quotation_projects SET project_id=$otherProject WHERE quotation_id=$id',
        { bind: { otherProject, id: first.quotationId }, transaction },
      ),
    )
    .then(
      () => null,
      (error: unknown) => error,
    );
  expect(getHttpErrorResponse(linkError)).toEqual(
    getHttpErrorResponse(projectError),
  );
  expect((await current.getById(first.quotationId)).projectId).toBe(projectId);
});
it('preserves ordinary project existence, deletion and exact-customer validation without creating task links', async () => {
  const current = service();
  await expect(
    current.create({ customerId, projectId: randomUUID() }, actor),
  ).rejects.toMatchObject({ status: 404 });
  const unrelatedProject = randomUUID();
  const unrelatedCustomer = randomUUID();
  await database().query(
    'INSERT INTO projects(id,customer_id,parent_project_id) VALUES ($id,$customerId,$parentId)',
    {
      bind: {
        id: unrelatedProject,
        customerId: unrelatedCustomer,
        parentId: projectId,
      },
    },
  );
  await expect(
    current.create({ customerId, projectId: unrelatedProject }, actor),
  ).rejects.toMatchObject({ status: 400 });
  await database().query(
    'UPDATE projects SET deleted_at=now() WHERE id=$projectId',
    { bind: { projectId } },
  );
  try {
    await expect(
      current.create({ customerId, projectId }, actor),
    ).rejects.toMatchObject({ status: 404 });
  } finally {
    await database().query(
      'UPDATE projects SET deleted_at=NULL WHERE id=$projectId',
      { bind: { projectId } },
    );
  }
  expect((await database().query('SELECT id FROM quotations'))[0]).toEqual([]);
  const unlinked = await current.create({ customerId }, actor);
  expect(unlinked.projectId).toBeNull();
  expect(await links().list(taskId)).toEqual([]);
});
