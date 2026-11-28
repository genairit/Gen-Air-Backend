import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const projectId = '00000000-0000-4000-8000-000000000001';
const documentId = '00000000-0000-4000-8000-000000000002';
const lineId = '00000000-0000-4000-8000-000000000003';
const revisionId = '00000000-0000-4000-8000-000000000004';

describe('Named project BOQ migration', () => {
  it('cleans legacy documents once and preserves unrelated data and future history protection', async () => {
    const database = new PGlite();
    const migration = await readFile(
      resolve(process.cwd(), 'migrations/2026-11-28-named-project-boqs.sql'),
      'utf8',
    );
    try {
      await database.exec(`
        CREATE TABLE projects (id uuid PRIMARY KEY);
        CREATE TABLE quotations (id uuid PRIMARY KEY);
        CREATE TABLE materials (id uuid PRIMARY KEY);
        CREATE TABLE project_boqs (
          id uuid PRIMARY KEY, project_id uuid NOT NULL UNIQUE REFERENCES projects(id),
          created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE project_boq_lines (id uuid PRIMARY KEY, boq_id uuid REFERENCES project_boqs(id));
        CREATE TABLE project_boq_revisions (id uuid PRIMARY KEY, boq_id uuid REFERENCES project_boqs(id));
        CREATE TABLE purchase_record_lines (boq_line_id uuid, snapshot text);
        CREATE FUNCTION prevent_project_boq_revision_change() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'project BOQ revisions are immutable'; END; $$;
        CREATE TRIGGER trg_project_boq_revision_immutable BEFORE UPDATE OR DELETE ON project_boq_revisions
        FOR EACH ROW EXECUTE FUNCTION prevent_project_boq_revision_change();
        INSERT INTO projects VALUES ('${projectId}');
        INSERT INTO quotations VALUES ('${projectId}');
        INSERT INTO materials VALUES ('${projectId}');
        INSERT INTO project_boqs (id, project_id) VALUES ('${documentId}', '${projectId}');
        INSERT INTO project_boq_lines VALUES ('${lineId}', '${documentId}');
        INSERT INTO project_boq_revisions VALUES ('${revisionId}', '${documentId}');
        INSERT INTO purchase_record_lines VALUES ('${lineId}', 'recorded material and cost');
      `);
      await database.exec(migration);
      for (const table of [
        'project_boqs',
        'project_boq_lines',
        'project_boq_revisions',
      ]) {
        expect(
          (await database.query(`SELECT * FROM ${table}`)).rows,
        ).toHaveLength(0);
      }
      for (const table of [
        'projects',
        'quotations',
        'materials',
        'purchase_record_lines',
      ]) {
        expect(
          (await database.query(`SELECT * FROM ${table}`)).rows,
        ).toHaveLength(1);
      }
      await database.exec(`
        INSERT INTO project_boqs (id, project_id, name) VALUES
          ('${documentId}', '${projectId}', 'קומה א'), ('${lineId}', '${projectId}', 'קומה ב');
        INSERT INTO project_boq_revisions VALUES ('${revisionId}', '${documentId}');
      `);
      await database.exec(migration);
      expect(
        (await database.query('SELECT * FROM project_boqs')).rows,
      ).toHaveLength(2);
      await expect(
        database.exec('DELETE FROM project_boq_revisions'),
      ).rejects.toThrow('project BOQ revisions are immutable');
      await expect(
        database.exec(`UPDATE project_boqs SET name = '  '`),
      ).rejects.toThrow('chk_project_boq_name');
    } finally {
      await database.close();
    }
  }, 30000);
});
