import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const purchaseMigration = readFileSync(new URL('../migrations/2026-11-17-purchase-record-ledger.sql', import.meta.url), 'utf8');
const agreementMigration = readFileSync(new URL('../migrations/2026-11-17-project-supplier-agreements.sql', import.meta.url), 'utf8');

test('supplier agreements constrain project, unit price, dates and immutable revisions', async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE projects (id uuid PRIMARY KEY);
    CREATE TABLE users (id uuid PRIMARY KEY);
    CREATE TABLE materials (id uuid PRIMARY KEY);
    INSERT INTO projects VALUES ('00000000-0000-0000-0000-000000000001');
    INSERT INTO users VALUES ('00000000-0000-0000-0000-000000000002');
    INSERT INTO materials VALUES ('00000000-0000-0000-0000-000000000003');
  `);
  await db.exec(purchaseMigration);
  await db.exec(agreementMigration);
  await db.exec(`INSERT INTO suppliers (id, name, contact_name, created_by_id, updated_by_id)
    VALUES ('00000000-0000-0000-0000-000000000004', 'ספק א', 'איש קשר', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002')`);
  const agreement = `INSERT INTO project_supplier_agreements
    (id, project_id, boq_source_key, material_id, material_unit, supplier_id, unit_price, currency_code, created_by_id, updated_by_id)
    VALUES ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'source:one', '00000000-0000-0000-0000-000000000003', 'unit', '00000000-0000-0000-0000-000000000004', 12.50, 'ILS', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002')`;
  await db.exec(agreement);
  await assert.rejects(db.exec(agreement), /duplicate key/);
  await assert.rejects(db.exec(`INSERT INTO project_supplier_agreements
    (project_id, boq_source_key, material_id, material_unit, supplier_id, unit_price, currency_code, created_by_id, updated_by_id)
    VALUES ('00000000-0000-0000-0000-000000000001', 'source:two', '00000000-0000-0000-0000-000000000003', 'unit', '00000000-0000-0000-0000-000000000004', -1, 'ILS', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002')`), /check constraint/);
  await assert.rejects(db.exec(`UPDATE project_supplier_agreements SET effective_from = '2026-12-01', effective_through = '2026-11-01'`), /check constraint/);
  await db.exec(`INSERT INTO project_supplier_agreement_revisions (agreement_id, version, snapshot, actor_id)
    VALUES ('00000000-0000-0000-0000-000000000005', 1, '{"unitPrice":"12.5000"}', '00000000-0000-0000-0000-000000000002')`);
  await assert.rejects(db.exec(`UPDATE project_supplier_agreement_revisions SET snapshot = '{}'`), /immutable/);
  await db.exec(`INSERT INTO purchase_records (id, project_id, status, created_by_id, updated_by_id, idempotency_key, payload_hash)
    VALUES ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'approved', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000007', 'hash')`);
  await db.exec(`INSERT INTO purchase_record_lines (id, record_id, boq_line_id, boq_source_key, material_id, material_name, material_unit, quantity)
    VALUES ('00000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000009', 'source:one', '00000000-0000-0000-0000-000000000003', 'חומר', 'unit', 3)`);
  const term = `INSERT INTO purchase_order_line_terms (record_line_id, supplier_agreement_id, supplier_agreement_version, unit_cost, currency_code, actor_id)
    VALUES ('00000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000005', 1, 12.50, 'ILS', '00000000-0000-0000-0000-000000000002')`;
  await db.exec(term);
  await assert.rejects(db.exec(term), /duplicate key/);
  await assert.rejects(db.exec(`UPDATE purchase_order_line_terms SET unit_cost = 14`), /immutable/);
  await assert.rejects(db.exec(`DELETE FROM purchase_order_line_terms`), /immutable/);
  await db.close();
});
