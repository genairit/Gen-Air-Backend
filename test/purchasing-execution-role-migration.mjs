import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';

const roleMigration = readFileSync(
  new URL(
    '../migrations/2026-11-09-add-purchasing-execution-manager-role.sql',
    import.meta.url,
  ),
  'utf8',
);
const grantMigration = readFileSync(
  new URL(
    '../migrations/2026-11-09-seed-purchasing-execution-permissions.sql',
    import.meta.url,
  ),
  'utf8',
);

test('new account role and permission matrix are idempotent and preserve existing grants', async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE TYPE public.user_role AS ENUM ('system_admin', 'secretary', 'project_manager', 'installer', 'engineer', 'finance');
    CREATE TABLE public.permissions (key text PRIMARY KEY);
    CREATE TABLE public.role_permissions (
      role public.user_role NOT NULL,
      permission_key text NOT NULL REFERENCES public.permissions(key),
      PRIMARY KEY (role, permission_key)
    );
    CREATE TABLE public.user_roles (user_id uuid NOT NULL, role public.user_role NOT NULL);
    INSERT INTO public.permissions (key) VALUES
      ('projects.read'), ('customers.read'), ('tasks.read'), ('employees.read'),
      ('drive.read'), ('quotations.read'), ('tasks.claim');
    INSERT INTO public.role_permissions VALUES ('engineer', 'tasks.claim');
  `);

  await db.exec(roleMigration);
  await db.exec(grantMigration);
  await db.exec(roleMigration);
  await db.exec(grantMigration);

  const grants = await db.query(
    `SELECT role::text, permission_key FROM public.role_permissions ORDER BY role, permission_key`,
  );
  const forRole = (role) =>
    grants.rows
      .filter((row) => row.role === role)
      .map((row) => row.permission_key);
  assert.deepEqual(forRole('purchasing_execution_manager'), [
    'boq_templates.manage',
    'customers.read',
    'drive.read',
    'employees.read',
    'execution_handoffs.manage',
    'projects.read',
    'purchase_orders.approve',
    'purchase_orders.send',
    'purchase_requests.review',
    'quotations.read',
    'supplier_agreements.manage',
    'tasks.read',
  ]);
  assert.deepEqual(forRole('finance'), [
    'payments.record',
    'subcontractor_settlements.approve',
  ]);
  assert.deepEqual(forRole('engineer'), ['tasks.claim']);
  assert.equal(
    (await db.query('SELECT count(*)::int AS count FROM public.user_roles'))
      .rows[0].count,
    0,
  );
  await db.close();
});
