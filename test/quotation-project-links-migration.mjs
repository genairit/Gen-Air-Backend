import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const MIGRATIONS = [
  '2026-11-09-assign-engineers-to-apartments.sql',
  '2026-11-09-quotation-project-links.sql',
];

const readMigration = (name) =>
  readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');

test('quotation project links migration moves every project_id into one primary link', async () => {
  const database = new PGlite();
  try {
    await database.exec(`
      CREATE TABLE project_types (id uuid PRIMARY KEY, can_have_apartments boolean NOT NULL);
      CREATE TABLE projects (
        id uuid PRIMARY KEY,
        project_type_id uuid NOT NULL REFERENCES project_types(id),
        parent_project_id uuid REFERENCES projects(id),
        has_own_team boolean NOT NULL DEFAULT false
      );
      CREATE TABLE project_members (
        id uuid PRIMARY KEY,
        project_id uuid NOT NULL REFERENCES projects(id),
        user_id uuid NOT NULL,
        role text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (project_id, role)
      );
      INSERT INTO project_types VALUES ('00000000-0000-4000-8000-0000000000c1', true);
      CREATE TABLE quotations (
        id uuid PRIMARY KEY,
        number text NOT NULL,
        project_id uuid REFERENCES projects(id),
        created_at timestamptz NOT NULL DEFAULT '2026-11-01T08:00:00Z',
        updated_at timestamptz NOT NULL DEFAULT '2026-11-02T08:00:00Z'
      );
      CREATE INDEX idx_quotations_project ON quotations(project_id);
      INSERT INTO projects (id, project_type_id, parent_project_id) VALUES
        ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000c1', NULL),
        ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b1');
      INSERT INTO project_members (id, project_id, user_id, role) VALUES
        ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000f1', 'engineer');
      INSERT INTO quotations (id, number, project_id) VALUES
        ('00000000-0000-4000-8000-0000000000a1', '2611-000001', '00000000-0000-4000-8000-0000000000b1'),
        ('00000000-0000-4000-8000-0000000000a2', '2611-000002', '00000000-0000-4000-8000-0000000000b1'),
        ('00000000-0000-4000-8000-0000000000a3', '2611-000003', '00000000-0000-4000-8000-0000000000b2'),
        ('00000000-0000-4000-8000-0000000000a4', '2611-000004', NULL);
    `);
    for (const name of MIGRATIONS) {
      const migration = await readMigration(name);
      await database.exec(migration);
      await database.exec(migration);
    }
    const engineers = await database.query(
      "SELECT project_id FROM project_members WHERE role = 'engineer'",
    );
    assert.deepEqual(engineers.rows, [
      { project_id: '00000000-0000-4000-8000-0000000000b2' },
    ]);

    const links = await database.query(
      'SELECT quotation_id, project_id, is_primary, created_at, updated_at FROM quotation_projects ORDER BY quotation_id',
    );
    const column = await database.query(
      "SELECT 1 FROM information_schema.columns WHERE table_name = 'quotations' AND column_name = 'project_id'",
    );
    const quotations = await database.query(
      'SELECT id, number FROM quotations ORDER BY id',
    );

    assert.deepEqual(
      links.rows.map(({ quotation_id, project_id, is_primary }) => [
        quotation_id,
        project_id,
        is_primary,
      ]),
      [
        [
          '00000000-0000-4000-8000-0000000000a1',
          '00000000-0000-4000-8000-0000000000b1',
          true,
        ],
        [
          '00000000-0000-4000-8000-0000000000a2',
          '00000000-0000-4000-8000-0000000000b1',
          true,
        ],
        [
          '00000000-0000-4000-8000-0000000000a3',
          '00000000-0000-4000-8000-0000000000b2',
          true,
        ],
      ],
    );
    assert.equal(
      links.rows[0].created_at.toISOString(),
      '2026-11-01T08:00:00.000Z',
    );
    assert.equal(column.rows.length, 0);
    assert.equal(quotations.rows.length, 4);
    await assert.rejects(
      database.exec(
        "INSERT INTO quotation_projects (quotation_id, project_id, is_primary) VALUES ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2', true)",
      ),
    );
  } finally {
    await database.close();
  }
});
