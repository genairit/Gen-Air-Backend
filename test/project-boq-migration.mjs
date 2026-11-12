import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync(new URL('../migrations/2026-11-12-project-procurement-boq.sql', import.meta.url), 'utf8');

test('project BOQ migration constrains quantities, preserves revisions and grants only procurement roles', async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE TYPE user_role AS ENUM ('system_admin', 'purchasing_execution_manager', 'project_manager');
    CREATE TABLE permissions (key text PRIMARY KEY);
    CREATE TABLE role_permissions (role user_role NOT NULL, permission_key text NOT NULL REFERENCES permissions(key), PRIMARY KEY(role, permission_key));
    CREATE TABLE projects (id uuid PRIMARY KEY);
    CREATE TABLE quotations (id uuid PRIMARY KEY);
    CREATE TABLE users (id uuid PRIMARY KEY);
    CREATE TABLE materials (id uuid PRIMARY KEY);
  `);
  await db.exec(migration);
  const grants = await db.query("SELECT role::text, permission_key FROM role_permissions ORDER BY role, permission_key");
  assert.deepEqual(grants.rows, [
    { role: 'purchasing_execution_manager', permission_key: 'project_boq.manage' },
    { role: 'purchasing_execution_manager', permission_key: 'project_boq.read' },
    { role: 'system_admin', permission_key: 'project_boq.manage' },
    { role: 'system_admin', permission_key: 'project_boq.read' },
  ]);
  await db.exec(`
    INSERT INTO users VALUES ('00000000-0000-0000-0000-000000000001');
    INSERT INTO projects VALUES ('00000000-0000-0000-0000-000000000002');
    INSERT INTO materials VALUES ('00000000-0000-0000-0000-000000000003');
    INSERT INTO project_boqs (id, project_id, created_by_id, updated_by_id)
    VALUES ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001');
    INSERT INTO project_boq_revisions (boq_id, revision, lines, created_by_id)
    VALUES ('00000000-0000-0000-0000-000000000004', 1, '[]', '00000000-0000-0000-0000-000000000001');
  `);
  await assert.rejects(db.exec("UPDATE project_boq_revisions SET lines = '[]'"), /immutable/);
  await assert.rejects(db.exec(`INSERT INTO project_boq_lines (boq_id, material_id, source_key, material_code, material_name, material_category, material_unit, source_basis, required_quantity, display_order)
    VALUES ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000003', 'bad', 'M', 'Material', 'Category', 'unit', 'manual', -1, 0)`), /chk_project_boq_required/);
  await db.close();
});
