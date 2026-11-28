import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = (path: string) =>
  readFile(resolve(process.cwd(), 'migrations', path), 'utf8');

it('reconciles only supported project matches, reports uncertain records and verifies the cutover', async () => {
  const db = new PGlite();
  const reconcile = await migration(
    '2026-11-28-reconcile-project-quotations.sql',
  );
  const verify = await migration('checks/verify-project-quotations.sql');
  const customer = randomUUID();
  const otherCustomer = randomUUID();
  const project = randomUUID();
  const alternative = randomUUID();
  const archived = randomUUID();
  const apartment = randomUUID();
  const task = randomUUID();
  const auto = randomUUID();
  const shared = randomUUID();
  const conflicting = randomUUID();
  const missing = randomUUID();
  const deletedProject = randomUUID();
  const wrongCustomerProject = randomUUID();
  try {
    await db.exec(`
      CREATE TABLE customers(id uuid PRIMARY KEY);
      CREATE TABLE quotations(id uuid PRIMARY KEY, number text, customer_id uuid, deleted_at timestamptz);
      CREATE TABLE projects(id uuid PRIMARY KEY, customer_id uuid, parent_project_id uuid, deleted_at timestamptz);
      CREATE TABLE quotation_projects(quotation_id uuid, project_id uuid, is_primary boolean, PRIMARY KEY(quotation_id, project_id));
      CREATE UNIQUE INDEX primary_project ON quotation_projects(quotation_id) WHERE is_primary;
      CREATE TABLE tasks(id uuid PRIMARY KEY, task_type text, project_id uuid, customer_id uuid);
      CREATE TABLE task_quotation_links(task_id uuid, quotation_id uuid);
      CREATE TABLE engineering_estimate_revisions(quotation_id uuid, snapshot jsonb);
      CREATE TABLE project_boqs(id uuid, source_quotation_id uuid, project_id uuid);
      CREATE TABLE project_boq_revisions(boq_id uuid, source_quotation_id uuid);
      CREATE TABLE quotation_publication_cycles(quotation_id uuid, project_id uuid, terminal boolean);
    `);
    await db.query(
      'INSERT INTO projects VALUES ($1,$2,NULL,NULL),($3,$2,NULL,NULL),($4,$2,NULL,now()),($5,$2,$1,NULL),($6,$7,NULL,NULL)',
      [
        project,
        customer,
        alternative,
        archived,
        apartment,
        wrongCustomerProject,
        otherCustomer,
      ],
    );
    for (const [index, id] of [
      auto,
      shared,
      conflicting,
      missing,
      deletedProject,
    ].entries()) {
      await db.query('INSERT INTO quotations VALUES ($1,$2,$3,NULL)', [
        id,
        String(index),
        customer,
      ]);
    }
    await db.query("INSERT INTO tasks VALUES ($1,'quotation',$2,NULL)", [
      task,
      project,
    ]);
    await db.query('INSERT INTO task_quotation_links VALUES ($1,$2),($1,$3)', [
      task,
      auto,
      conflicting,
    ]);
    await db.query(
      'INSERT INTO quotation_publication_cycles VALUES ($1,$2,true)',
      [conflicting, alternative],
    );
    await db.query(
      'INSERT INTO quotation_projects VALUES ($1,$2,false),($3,$4,true)',
      [shared, apartment, deletedProject, archived],
    );

    await db.exec(reconcile);
    const primaryIds = async () =>
      (
        await db.query<{ id: string }>(
          'SELECT quotation_id AS id FROM quotation_projects WHERE project_id=$1 AND is_primary ORDER BY id',
          [project],
        )
      ).rows.map((row) => row.id);
    expect(await primaryIds()).toEqual([auto, shared].sort());
    await expect(db.exec(verify)).rejects.toThrow('3 live quotations');
    await db.exec('ROLLBACK');
    await db.exec(reconcile);
    expect(await primaryIds()).toHaveLength(2);

    await db.query(
      'INSERT INTO pg_temp.reviewed_quotation_projects VALUES ($1,$2),($3,$4),($5,$4)',
      [missing, wrongCustomerProject, conflicting, project, deletedProject],
    );
    await expect(db.exec(reconcile)).rejects.toThrow('invalid or stale');
    await db.exec('ROLLBACK');
    expect(await primaryIds()).toHaveLength(2);
    await db.query(
      'UPDATE pg_temp.reviewed_quotation_projects SET project_id=$1 WHERE quotation_id=$2',
      [alternative, missing],
    );
    await db.exec(reconcile);
    await db.exec(reconcile);
    await db.exec(verify);
    expect(await primaryIds()).toEqual(
      [auto, shared, conflicting, deletedProject].sort(),
    );
    expect(
      (await db.query('SELECT * FROM quotation_projects WHERE NOT is_primary'))
        .rows,
    ).toEqual([
      { quotation_id: shared, project_id: apartment, is_primary: false },
    ]);
  } finally {
    await db.close();
  }
}, 30000);
