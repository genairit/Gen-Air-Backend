import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(
  new URL(
    '../migrations/2026-11-09-engineering-four-project-statuses.sql',
    import.meta.url,
  ),
  'utf8',
);

await test('four project statuses preserve assignments and historical names', async (suite) => {
  const database = new PGlite();
  suite.after(async () => database.close());

  await database.exec(`
    CREATE TABLE project_stages (
      id uuid PRIMARY KEY,
      name text NOT NULL,
      description text,
      tag text,
      color text,
      position integer NOT NULL,
      deleted_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX uq_project_stages_position ON project_stages(position) WHERE deleted_at IS NULL;
    CREATE TABLE projects (
      id uuid PRIMARY KEY,
      stage_id uuid NOT NULL REFERENCES project_stages(id) DEFAULT '6502a045-2a7d-4bc8-8ba1-36eaedc49a00',
      updated_at timestamptz(3) NOT NULL DEFAULT now()
    );
    CREATE TABLE project_stage_transitions (
      id uuid PRIMARY KEY,
      from_stage_id uuid REFERENCES project_stages(id),
      to_stage_id uuid NOT NULL REFERENCES project_stages(id)
    );
    INSERT INTO project_stages(id,name,position) VALUES
      ('6502a045-2a7d-4bc8-8ba1-36eaedc49a00','טיוטה',0),
      ('6502a045-2a7d-4bc8-8ba1-36eaedc49a01','ממתין',1),
      ('6502a045-2a7d-4bc8-8ba1-36eaedc49a02','בעבודה',2),
      ('6502a045-2a7d-4bc8-8ba1-36eaedc49a03','להמתין',3),
      ('6502a045-2a7d-4bc8-8ba1-36eaedc49a04','הסתיים',4);
    INSERT INTO projects(id,stage_id) VALUES
      ('10000000-0000-4000-8000-000000000000','6502a045-2a7d-4bc8-8ba1-36eaedc49a00'),
      ('10000000-0000-4000-8000-000000000001','6502a045-2a7d-4bc8-8ba1-36eaedc49a01'),
      ('10000000-0000-4000-8000-000000000002','6502a045-2a7d-4bc8-8ba1-36eaedc49a02'),
      ('10000000-0000-4000-8000-000000000003','6502a045-2a7d-4bc8-8ba1-36eaedc49a03'),
      ('10000000-0000-4000-8000-000000000004','6502a045-2a7d-4bc8-8ba1-36eaedc49a04');
    INSERT INTO project_stage_transitions(id,from_stage_id,to_stage_id) VALUES
      ('20000000-0000-4000-8000-000000000000','6502a045-2a7d-4bc8-8ba1-36eaedc49a00','6502a045-2a7d-4bc8-8ba1-36eaedc49a03');
    CREATE FUNCTION reject_project_status_definition_change() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'fixed' USING ERRCODE = '23514'; END; $$;
    CREATE TRIGGER project_stages_readonly BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE
      ON project_stages FOR EACH STATEMENT EXECUTE FUNCTION reject_project_status_definition_change();
    CREATE FUNCTION require_active_project_status() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM project_stages WHERE id = NEW.stage_id AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'inactive' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END; $$;
    CREATE TRIGGER projects_require_active_status BEFORE INSERT OR UPDATE OF stage_id
      ON projects FOR EACH ROW EXECUTE FUNCTION require_active_project_status();
  `);

  await database.exec(migration);
  const active = await database.query(
    'SELECT id, name, position FROM project_stages WHERE deleted_at IS NULL ORDER BY position',
  );
  assert.deepEqual(
    active.rows.map(({ name }) => name),
    ['טרם בעבודה', 'בעבודה', 'מחכה לתשובה', 'הושלם'],
  );
  const projects = await database.query(
    'SELECT stage_id FROM projects ORDER BY id',
  );
  assert.deepEqual(
    projects.rows.map(({ stage_id }) => stage_id),
    [
      '6502a045-2a7d-4bc8-8ba1-36eaedc49a05',
      '6502a045-2a7d-4bc8-8ba1-36eaedc49a05',
      '6502a045-2a7d-4bc8-8ba1-36eaedc49a02',
      '6502a045-2a7d-4bc8-8ba1-36eaedc49a06',
      '6502a045-2a7d-4bc8-8ba1-36eaedc49a07',
    ],
  );
  const history = await database.query(`
    SELECT previous.name AS from_name, next.name AS to_name
    FROM project_stage_transitions transition
    JOIN project_stages previous ON previous.id = transition.from_stage_id
    JOIN project_stages next ON next.id = transition.to_stage_id
  `);
  assert.deepEqual(history.rows, [{ from_name: 'טיוטה', to_name: 'להמתין' }]);
  const snapshots = await database.query(
    'SELECT count(*)::integer AS count FROM project_status_change_snapshots',
  );
  assert.equal(snapshots.rows[0].count, 4);

  await database.exec(`UPDATE projects SET stage_id='6502a045-2a7d-4bc8-8ba1-36eaedc49a07'
    WHERE id='10000000-0000-4000-8000-000000000000'`);
  await database.exec(migration);
  const afterRerun = await database.query(`SELECT stage_id FROM projects
    WHERE id='10000000-0000-4000-8000-000000000000'`);
  assert.equal(
    afterRerun.rows[0].stage_id,
    '6502a045-2a7d-4bc8-8ba1-36eaedc49a07',
  );
  await assert.rejects(
    database.exec("UPDATE project_stages SET name='edited' WHERE position=0"),
    /fixed/,
  );
});
