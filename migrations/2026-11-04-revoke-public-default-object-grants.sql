-- Follow-up to 2026-11-04-restrict-public-data-api.sql, which is already
-- deployed. Schema-specific grants to PUBLIC can survive global default
-- privilege revocation and reach anon/authenticated through PUBLIC membership.
BEGIN;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM PUBLIC;

-- Close any objects created between the two migrations as well.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  app_table record;
  app_routine record;
BEGIN
  FOR app_table IN
    SELECT format('%I.%I', namespace.nspname, relation.relname) AS name
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend AS dependency
        WHERE dependency.classid = 'pg_class'::regclass
          AND dependency.objid = relation.oid
          AND dependency.deptype = 'e'
      )
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', app_table.name);
  END LOOP;

  FOR app_routine IN
    SELECT namespace.nspname, routine.proname,
           pg_get_function_identity_arguments(routine.oid) AS arguments
    FROM pg_proc AS routine
    JOIN pg_namespace AS namespace ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend AS dependency
        WHERE dependency.classid = 'pg_proc'::regclass
          AND dependency.objid = routine.oid
          AND dependency.deptype = 'e'
      )
  LOOP
    EXECUTE format(
      'REVOKE ALL ON ROUTINE %I.%I(%s) FROM PUBLIC, anon, authenticated',
      app_routine.nspname,
      app_routine.proname,
      app_routine.arguments
    );
  END LOOP;
END;
$$;

COMMIT;
