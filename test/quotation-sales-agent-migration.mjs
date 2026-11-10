import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const purchasingMigration = new URL(
  '../migrations/2026-11-09-add-purchasing-execution-manager-role.sql',
  import.meta.url,
);
const salesAgentMigration = new URL(
  '../migrations/2026-11-10-add-quotation-sales-agent.sql',
  import.meta.url,
);

test('sales-agent migration composes with purchasing and preserves quotation links', async () => {
  const database = new PGlite();
  try {
    await database.exec(`
      CREATE TYPE public.user_role AS ENUM ('system_admin', 'engineer');
      CREATE TABLE public.users (id uuid PRIMARY KEY);
      CREATE TABLE public.quotations (id uuid PRIMARY KEY);
      CREATE TABLE public.quotation_projects (
        quotation_id uuid NOT NULL REFERENCES public.quotations(id),
        project_id uuid NOT NULL,
        PRIMARY KEY (quotation_id, project_id)
      );
      CREATE TABLE public.role_permissions (
        role public.user_role NOT NULL,
        permission_key text NOT NULL
      );
    `);

    const purchasing = await readFile(purchasingMigration, 'utf8');
    const salesAgent = await readFile(salesAgentMigration, 'utf8');
    await database.exec(purchasing);
    await database.exec(salesAgent);
    await database.exec(purchasing);
    await database.exec(salesAgent);

    const roles = await database.query(`
      SELECT enumlabel FROM pg_enum
      WHERE enumtypid = 'public.user_role'::regtype
      ORDER BY enumsortorder
    `);
    assert.deepEqual(
      roles.rows.map(({ enumlabel }) => enumlabel),
      [
        'system_admin',
        'engineer',
        'purchasing_execution_manager',
        'sales_agent',
      ],
    );

    const columns = await database.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'quotations'
      ORDER BY ordinal_position
    `);
    assert.deepEqual(
      columns.rows.map(({ column_name }) => column_name),
      ['id', 'sales_agent_id'],
    );
    const grants = await database.query(
      `SELECT count(*)::int AS count FROM role_permissions WHERE role = 'sales_agent'`,
    );
    assert.equal(grants.rows[0].count, 0);

    await database.exec(`
      INSERT INTO users VALUES ('00000000-0000-4000-8000-0000000000a1');
      INSERT INTO quotations (id, sales_agent_id) VALUES (
        '00000000-0000-4000-8000-0000000000b1',
        '00000000-0000-4000-8000-0000000000a1'
      );
      INSERT INTO quotation_projects VALUES (
        '00000000-0000-4000-8000-0000000000b1',
        '00000000-0000-4000-8000-0000000000c1'
      );
    `);
    await assert.rejects(
      database.exec(
        `DELETE FROM users WHERE id = '00000000-0000-4000-8000-0000000000a1'`,
      ),
      /foreign key constraint/,
    );
    const links = await database.query(
      'SELECT count(*)::int AS count FROM quotation_projects',
    );
    assert.equal(links.rows[0].count, 1);
  } finally {
    await database.close();
  }
});
