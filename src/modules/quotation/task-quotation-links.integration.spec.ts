import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { mock } from 'jest-mock-extended';
import { execFile } from 'node:child_process';
import { Sequelize } from 'sequelize-typescript';
import { QuotationService } from './quotation.service';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import { TaskQuotationLinksService } from './task-quotation-links.service';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';

const execute = promisify(execFile);
const binaries = resolve(
  process.cwd(),
  'node_modules',
  '@embedded-postgres',
  `${process.platform}-${process.arch}`,
  'native',
  'bin',
);
const state: { database: Sequelize | null; directory: string } = {
  database: null,
  directory: '',
};
const taskId = randomUUID();
const customerId = randomUUID();
const projectId = randomUUID();
const actor = mock<IAuthorizedUser>({
  permissions: [
    PERMISSIONS.TASKS_READ,
    PERMISSIONS.QUOTATIONS_READ,
    PERMISSIONS.QUOTATIONS_CREATE,
    PERMISSIONS.PROJECTS_READ,
    PERMISSIONS.CUSTOMERS_READ,
  ],
});
const database = () => {
  if (!state.database) {
    throw new Error('Database unavailable');
  }
  return state.database;
};
const links = () => new TaskQuotationLinksService(database());
const service = () => {
  const current = new QuotationService(
    mock(),
    mock(),
    mock(),
    mock(),
    mock(),
    mock(),
    mock(),
    mock(),
    mock(),
    new DatabaseTransactionService(database()),
    mock(),
    mock(),
    links(),
  );
  jest
    .spyOn(current, 'createDraft')
    .mockImplementation(async (input, _actor, transaction) => {
      const id = randomUUID();
      await database().query(
        "INSERT INTO quotations(id,number,status,customer_id) VALUES ($id::uuid,$id::text,'draft',$customerId)",
        { bind: { id, customerId: input.customerId }, transaction },
      );
      if (input.projectId) {
        await database().query(
          'INSERT INTO quotation_projects VALUES ($id,$projectId,true)',
          { bind: { id, projectId: input.projectId }, transaction },
        );
      }
      return id;
    });
  return current;
};
beforeAll(async () => {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  await new Promise<void>((done) => server.close(() => done()));
  if (!address || typeof address === 'string') {
    throw new Error('No port');
  }
  state.directory = await mkdtemp(join(tmpdir(), 'task-quotes-'));
  await execute(resolve(binaries, 'initdb'), [
    '-D',
    state.directory,
    '-U',
    'postgres',
    '--auth=trust',
  ]);
  await execute(resolve(binaries, 'pg_ctl'), [
    '-D',
    state.directory,
    '-o',
    `-h 127.0.0.1 -p ${address.port}`,
    '-l',
    join(state.directory, 'postgres.log'),
    '-w',
    'start',
  ]);
  state.database = new Sequelize({
    dialect: 'postgres',
    host: '127.0.0.1',
    port: address.port,
    username: 'postgres',
    password: '',
    database: 'postgres',
    logging: false,
    pool: { max: 6, min: 0 },
  });
  await database().query(`CREATE ROLE anon;CREATE ROLE authenticated;
    CREATE TABLE customers(id uuid PRIMARY KEY,deleted_at timestamptz);
    CREATE TABLE projects(id uuid PRIMARY KEY,customer_id uuid,deleted_at timestamptz);
    CREATE TABLE tasks(id uuid PRIMARY KEY,title text,task_type text,project_id uuid,customer_id uuid,deleted_at timestamptz);
    CREATE TABLE quotations(id uuid PRIMARY KEY,number text,status text,customer_id uuid,deleted_at timestamptz);
    CREATE TABLE quotation_projects(quotation_id uuid,project_id uuid,is_primary boolean);
    INSERT INTO customers VALUES ('${customerId}',NULL);
    INSERT INTO projects VALUES ('${projectId}','${customerId}',NULL);
    INSERT INTO tasks VALUES ('${taskId}','Quotation task','quotation','${projectId}',NULL,NULL);`);
  await database().query(
    await readFile(
      resolve(process.cwd(), 'migrations/2026-11-23-task-quotation-links.sql'),
      'utf8',
    ),
  );
}, 30000);
afterAll(async () => {
  await state.database?.close();
  if (state.directory) {
    await execute(resolve(binaries, 'pg_ctl'), [
      '-D',
      state.directory,
      '-m',
      'immediate',
      '-w',
      'stop',
    ]);
    await rm(state.directory, { recursive: true, force: true });
  }
});
beforeEach(async () => {
  await database().query(
    'TRUNCATE task_quotation_links,quotation_projects,quotations',
  );
});
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
  expect(jest.spyOn(current, 'createDraft')).toHaveBeenCalledTimes(1);
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
it('copies secondary links and recovers a deleted primary without losing historical associations', async () => {
  const current = service();
  const first = await current.createForTask(taskId, actor);
  const secondary = randomUUID();
  await database().transaction(async (transaction) => {
    await database().query(
      'INSERT INTO quotations SELECT $id::uuid,$id::text,status,customer_id,NULL FROM quotations WHERE id=$source',
      { bind: { id: secondary, source: first.quotationId }, transaction },
    );
    await database().query(
      'INSERT INTO quotation_projects VALUES ($id,$projectId,true)',
      { bind: { id: secondary, projectId }, transaction },
    );
    await links().copy(first.quotationId, secondary, transaction);
  });
  expect(
    (await links().list(taskId)).filter((row) => !row.isPrimary),
  ).toHaveLength(1);
  await database().query(
    'UPDATE quotations SET deleted_at=now() WHERE id=$id',
    { bind: { id: first.quotationId } },
  );
  expect(await current.createForTask(taskId, actor)).toEqual({
    quotationId: secondary,
    created: false,
  });
  const [history] = await database().query(
    'SELECT * FROM task_quotation_links',
  );
  expect(history).toHaveLength(2);
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
  expect(jest.spyOn(current, 'createDraft')).toHaveBeenCalledTimes(1);
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
