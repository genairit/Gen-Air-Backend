import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(
  new URL('../migrations/sprint-almon/after_deploy.sql', import.meta.url),
  'utf8',
);

test('payment ownership cleanup is disabled until an operator reviews it', () => {
  const runnable = migration
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');

  assert.doesNotMatch(
    runnable,
    /^\s*(DROP|DELETE|TRUNCATE|UPDATE|INSERT|COMMIT)\b/im,
  );
  assert.match(runnable, /BEGIN;/);
  assert.match(runnable, /information_schema\.columns/);
  assert.doesNotMatch(runnable, /\bCASCADE\b/);
});

test('reviewed cleanup discards only legacy project terms without backfilling snapshots', async () => {
  const database = new PGlite();
  try {
    await database.exec(`
      CREATE TABLE users (id uuid PRIMARY KEY, role text, deleted_at timestamptz);
      CREATE TABLE user_roles (user_id uuid, role text);
      CREATE TABLE user_role_audits (action text);
      CREATE TABLE task_status_transitions (changed_by_role text);
      CREATE TYPE payment_terms AS ENUM ('prepaid', 'other');
      CREATE TABLE projects (
        id integer PRIMARY KEY,
        payment_terms payment_terms,
        payment_terms_note text
      );
      CREATE TABLE customers (id integer PRIMARY KEY, payment_terms varchar(40));
      CREATE TABLE quotations (
        id integer PRIMARY KEY,
        payment_terms varchar(40),
        payment_terms_note text NOT NULL DEFAULT ''
      );
      INSERT INTO projects VALUES (1, 'other', 'discarded legacy note');
      INSERT INTO customers VALUES (1, 'prepaid'), (2, null);
      INSERT INTO quotations VALUES (1, 'other', 'quote-local note'), (2, null, '');
    `);

    const reviewed = migration.replace(
      /^-- (ALTER TABLE projects| {2}DROP .+|DROP TYPE .+)$/gm,
      '$1',
    );
    await database.exec(reviewed);

    const projects = await database.query('SELECT * FROM projects');
    const customers = await database.query(
      'SELECT * FROM customers ORDER BY id',
    );
    const quotations = await database.query(
      'SELECT * FROM quotations ORDER BY id',
    );
    const retiredType = await database.query(
      "SELECT typname FROM pg_type WHERE typname = 'payment_terms'",
    );

    assert.deepEqual(projects.rows, [{ id: 1 }]);
    assert.deepEqual(customers.rows, [
      { id: 1, payment_terms: 'prepaid' },
      { id: 2, payment_terms: null },
    ]);
    assert.deepEqual(quotations.rows, [
      { id: 1, payment_terms: 'other', payment_terms_note: 'quote-local note' },
      { id: 2, payment_terms: null, payment_terms_note: '' },
    ]);
    assert.deepEqual(retiredType.rows, []);
    await database.exec('ROLLBACK;');
  } finally {
    await database.close();
  }
});
