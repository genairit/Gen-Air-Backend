import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync(
  new URL(
    '../migrations/2026-11-09-reusable-contacts-and-optional-customer-primary.sql',
    import.meta.url,
  ),
  'utf8',
);

test('contact migration preserves IDs and maps explicit primary and site links', async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE customers (
      id uuid PRIMARY KEY,
      contact_name varchar(120) NOT NULL,
      phone varchar(20) NOT NULL,
      email varchar(254) NOT NULL,
      created_by_id uuid NOT NULL
    );
    CREATE TABLE customer_contacts (
      id uuid PRIMARY KEY,
      customer_id uuid NOT NULL REFERENCES customers(id),
      name varchar(200) NOT NULL,
      phone varchar(20),
      email varchar(254),
      role varchar(60),
      created_by_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );
    CREATE TABLE projects (
      id uuid PRIMARY KEY,
      contact_name varchar(120),
      contact_phone varchar(20),
      contact_role varchar(60),
      created_by_id uuid NOT NULL
    );
    INSERT INTO customers VALUES (
      '11111111-1111-4111-8111-111111111111',
      'Primary Person', '0521234567', 'primary@example.com',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    );
    INSERT INTO customer_contacts (id, customer_id, name, phone, email, role, created_by_id)
    VALUES
      ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
       'Primary Person', '0521234567', 'primary@example.com', NULL,
       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
      ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111',
       'Another Person', NULL, 'other@example.com', NULL,
       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    INSERT INTO projects VALUES
      ('44444444-4444-4444-8444-444444444444', 'Site Person', '0527654321', 'Engineer',
       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
      ('55555555-5555-4555-8555-555555555555', 'Site Person', '0527654321', 'Engineer',
       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  `);
  await db.exec(migration);

  const primary = await db.query('SELECT primary_contact_id FROM customers');
  assert.equal(
    primary.rows[0].primary_contact_id,
    '22222222-2222-4222-8222-222222222222',
  );
  const contacts = await db.query(
    'SELECT id FROM customer_contacts ORDER BY id',
  );
  assert.equal(contacts.rows.length, 4);
  assert.ok(
    contacts.rows.some(
      (row) => row.id === '33333333-3333-4333-8333-333333333333',
    ),
  );
  const links = await db.query(
    'SELECT project_id, contact_id FROM project_contact_links ORDER BY project_id',
  );
  assert.equal(links.rows.length, 2);
  assert.notEqual(links.rows[0].contact_id, links.rows[1].contact_id);

  await db.exec(`
    INSERT INTO customers(id, contact_name, phone, email, created_by_id)
    VALUES ('66666666-6666-4666-8666-666666666666', NULL, NULL, NULL,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    DELETE FROM project_contact_links WHERE project_id = '44444444-4444-4444-8444-444444444444';
  `);
  const afterUnlink = await db.query(
    'SELECT count(*)::int AS count FROM customer_contacts',
  );
  assert.equal(afterUnlink.rows[0].count, 4);
  await db.close();
});
