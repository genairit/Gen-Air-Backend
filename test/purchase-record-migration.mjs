import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync(new URL('../migrations/2026-11-17-purchase-record-ledger.sql', import.meta.url), 'utf8');

test('purchase ledger migration enforces quantities, idempotency and immutable history', async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE projects (id uuid PRIMARY KEY);
    CREATE TABLE users (id uuid PRIMARY KEY);
    CREATE TABLE materials (id uuid PRIMARY KEY);
    INSERT INTO projects VALUES ('00000000-0000-0000-0000-000000000001');
    INSERT INTO users VALUES ('00000000-0000-0000-0000-000000000002');
    INSERT INTO materials VALUES ('00000000-0000-0000-0000-000000000003');
  `);
  await db.exec(migration);
  const record = `INSERT INTO purchase_records (id, project_id, status, supplier_name, order_date, created_by_id, updated_by_id, idempotency_key, payload_hash)
    VALUES ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'ordered', 'ספק', '2026-11-17', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000005', '${'a'.repeat(64)}')`;
  await db.exec(record);
  await assert.rejects(db.exec(record), /duplicate key/);
  await db.exec(`INSERT INTO purchase_record_lines (id, record_id, boq_line_id, boq_source_key, material_id, material_name, material_unit, quantity)
    VALUES ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000007', 'source:one', '00000000-0000-0000-0000-000000000003', 'צינור', 'm', 5)`);
  await assert.rejects(db.exec(`UPDATE purchase_record_lines SET quantity = 6`), /immutable/);
  await assert.rejects(db.exec(`INSERT INTO purchase_record_corrections (record_line_id, idempotency_key, quantity, actor_id, reason)
    VALUES ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000008', -1, '00000000-0000-0000-0000-000000000002', 'תיקון')`), /check constraint/);
  await db.close();
});
