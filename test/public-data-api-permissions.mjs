import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('public CRM objects deny Data API roles and retain owner access', async () => {
  const database = new PGlite();
  try {
    await database.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE TABLE public.users (id integer PRIMARY KEY);
      CREATE TABLE public.customers (id integer PRIMARY KEY);
      CREATE SEQUENCE public.employee_number_seq;
      CREATE FUNCTION public.exposed() RETURNS integer
        LANGUAGE sql AS 'SELECT 1';
      GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
      GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
        GRANT ALL ON TABLES TO anon, authenticated;
      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
        GRANT ALL ON SEQUENCES TO anon, authenticated;
      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
        GRANT ALL ON FUNCTIONS TO anon, authenticated;
      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
        GRANT SELECT ON TABLES TO PUBLIC;
      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
        GRANT USAGE ON SEQUENCES TO PUBLIC;
      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
        GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
    `);

    const migration = await readFile(
      new URL(
        '../migrations/2026-11-04-restrict-public-data-api.sql',
        import.meta.url,
      ),
      'utf8',
    );
    await database.exec(migration);
    await database.exec(`
      CREATE TABLE public.between_migrations (id integer PRIMARY KEY);
      CREATE SEQUENCE public.between_migrations_seq;
      CREATE FUNCTION public.between_migrations_fn() RETURNS integer
        LANGUAGE sql AS 'SELECT 1';
    `);
    const correction = await readFile(
      new URL(
        '../migrations/2026-11-04-revoke-public-default-object-grants.sql',
        import.meta.url,
      ),
      'utf8',
    );
    await database.exec(correction);
    await database.exec(`
      CREATE TABLE public.future_table (id integer PRIMARY KEY);
      CREATE SEQUENCE public.future_sequence;
      CREATE FUNCTION public.future_function() RETURNS integer
        LANGUAGE sql AS 'SELECT 1';
    `);

    const { rows } = await database.query(`
      SELECT
        (SELECT bool_and(relrowsecurity)
         FROM pg_class
         WHERE oid IN ('public.users'::regclass, 'public.customers'::regclass))
          AS existing_rls,
        has_table_privilege('anon', 'public.users', 'SELECT')
          AS anon_existing_read,
        has_table_privilege('authenticated', 'public.customers', 'UPDATE')
          AS authenticated_existing_write,
        has_sequence_privilege('anon', 'public.employee_number_seq', 'USAGE')
          AS anon_existing_sequence,
        has_function_privilege('authenticated', 'public.exposed()', 'EXECUTE')
          AS authenticated_existing_function,
        has_table_privilege('anon', 'public.future_table', 'SELECT')
          AS anon_future_read,
        has_sequence_privilege('authenticated', 'public.future_sequence', 'USAGE')
          AS authenticated_future_sequence,
        has_function_privilege('anon', 'public.future_function()', 'EXECUTE')
          AS anon_future_function,
        has_table_privilege('anon', 'public.between_migrations', 'SELECT')
          AS anon_between_read,
        has_sequence_privilege('authenticated', 'public.between_migrations_seq', 'USAGE')
          AS authenticated_between_sequence,
        has_function_privilege('anon', 'public.between_migrations_fn()', 'EXECUTE')
          AS anon_between_function,
        (SELECT relrowsecurity FROM pg_class
         WHERE oid = 'public.between_migrations'::regclass)
          AS between_rls,
        has_table_privilege('postgres', 'public.users', 'SELECT,UPDATE')
          AS owner_access
    `);
    assert.deepEqual(rows[0], {
      existing_rls: true,
      anon_existing_read: false,
      authenticated_existing_write: false,
      anon_existing_sequence: false,
      authenticated_existing_function: false,
      anon_future_read: false,
      authenticated_future_sequence: false,
      anon_future_function: false,
      anon_between_read: false,
      authenticated_between_sequence: false,
      anon_between_function: false,
      between_rls: true,
      owner_access: true,
    });
  } finally {
    await database.close();
  }
});
