import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync(
  new URL('../migrations/2026-11-09-assign-engineers-to-apartments.sql', import.meta.url),
  'utf8',
);

test('building engineers move to inherited apartments and residential parents reject new assignments', async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE public.project_types (id uuid PRIMARY KEY, can_have_apartments boolean NOT NULL);
    CREATE TABLE public.projects (
      id uuid PRIMARY KEY, project_type_id uuid NOT NULL REFERENCES public.project_types(id),
      parent_project_id uuid REFERENCES public.projects(id), has_own_team boolean NOT NULL DEFAULT false
    );
    CREATE TABLE public.project_members (
      id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES public.projects(id),
      user_id uuid NOT NULL, role text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(project_id, role)
    );
    INSERT INTO public.project_types VALUES
      ('11111111-1111-4111-8111-111111111111', true),
      ('22222222-2222-4222-8222-222222222222', false);
    INSERT INTO public.projects VALUES
      ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', NULL, false),
      ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false),
      ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true),
      ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '22222222-2222-4222-8222-222222222222', NULL, false);
    INSERT INTO public.project_members (id, project_id, user_id, role) VALUES
      ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'engineer'),
      ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '22222222-2222-4222-8222-222222222222', 'engineer'),
      ('99999999-9999-4999-8999-999999999999', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', '11111111-1111-4111-8111-111111111111', 'engineer');
  `);

  await db.exec(migration);
  await db.exec(migration);
  const result = await db.query(`SELECT project_id, user_id FROM public.project_members WHERE role = 'engineer' ORDER BY project_id`);
  assert.deepEqual(result.rows, [
    { project_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', user_id: '11111111-1111-4111-8111-111111111111' },
    { project_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', user_id: '22222222-2222-4222-8222-222222222222' },
    { project_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', user_id: '11111111-1111-4111-8111-111111111111' },
  ]);
  await assert.rejects(
    db.exec(`INSERT INTO public.project_members (id, project_id, user_id, role) VALUES ('88888888-8888-4888-8888-888888888888', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'engineer')`),
    /Assign engineering workers to apartments/,
  );
  await db.close();
});
