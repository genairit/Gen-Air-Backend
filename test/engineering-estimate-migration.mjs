import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync(
  new URL(
    '../migrations/2026-11-26-engineering-estimates.sql',
    import.meta.url,
  ),
  'utf8',
);
const userId = '00000000-0000-4000-8000-000000000001';
const estimateId = '00000000-0000-4000-8000-000000000002';
const quotationId = '00000000-0000-4000-8000-000000000003';

test('estimate migration permits standalone private drafts and freezes priced revisions', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;
      CREATE TYPE user_role AS ENUM ('system_admin', 'engineering_lead', 'engineer');
      CREATE TABLE permissions (key text PRIMARY KEY, feature text, action text);
      CREATE TABLE role_permissions (role user_role, permission_key text REFERENCES permissions(key), PRIMARY KEY (role, permission_key));
      CREATE TABLE projects (id uuid PRIMARY KEY);
      CREATE TABLE quotations (id uuid PRIMARY KEY);
      CREATE TABLE users (id uuid PRIMARY KEY);
    `);
    await db.exec(migration);
    const grants = await db.query(`
      SELECT role::text, permission_key FROM role_permissions ORDER BY role, permission_key
    `);
    assert.equal(grants.rows.length, 8);
    assert.equal(
      grants.rows.some(
        ({ role, permission_key }) =>
          role === 'engineer' &&
          permission_key === 'engineering_estimates.approve',
      ),
      false,
    );
    const privacy = await db.query(`
      SELECT c.oid::regclass::text AS name, c.relrowsecurity AS rls,
        has_table_privilege('anon', c.oid, 'SELECT') AS anon_read,
        has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_read
      FROM pg_class c WHERE c.relname IN ('engineering_estimates', 'engineering_estimate_plans', 'engineering_estimate_revisions')
    `);
    assert.equal(privacy.rows.length, 3);
    assert.ok(
      privacy.rows.every(
        ({ rls, anon_read, auth_read }) => rls && !anon_read && !auth_read,
      ),
    );
    await db.query('INSERT INTO users VALUES ($1)', [userId]);
    await db.query('INSERT INTO quotations VALUES ($1)', [quotationId]);
    await db.query(
      `
      INSERT INTO engineering_estimates(id,name,created_by_id,project_id,version,updated_at,contents)
      VALUES ($1, 'בית מלון', $2, NULL, 1, now(), '{}')
    `,
      [estimateId, userId],
    );
    await db.query(
      `
      INSERT INTO engineering_estimate_revisions(estimate_id,version,snapshot,sketch_pdf)
      VALUES ($1, 1, '{"subtotal":"130.00"}', decode('255044462d76310a','hex'))
    `,
      [estimateId],
    );
    await assert.rejects(
      db.query('UPDATE engineering_estimate_revisions SET quotation_id=$1', [
        quotationId,
      ]),
      /check constraint/,
    );
    await db.query(
      'UPDATE engineering_estimate_revisions SET approved_at=now(), approved_by_id=$1',
      [userId],
    );
    await db.query(
      'UPDATE engineering_estimate_revisions SET quotation_id=$1',
      [quotationId],
    );
    await assert.rejects(
      db.exec("UPDATE engineering_estimate_revisions SET snapshot='{}'"),
      /immutable/,
    );
    await assert.rejects(
      db.exec('UPDATE engineering_estimate_revisions SET quotation_id=NULL'),
      /immutable/,
    );
    await assert.rejects(
      db.exec('DELETE FROM engineering_estimate_revisions'),
      /immutable/,
    );
  } finally {
    await db.close();
  }
});
