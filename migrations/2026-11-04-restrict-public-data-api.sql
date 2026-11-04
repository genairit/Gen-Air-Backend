-- Keep the CRM database accessible through its owner connection, but deny
-- Supabase Data API roles direct access to application objects in public.
-- Apply as the postgres owner after the existing schema migrations.
BEGIN;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- Leave extension-owned routines (for example citext operators) alone. Revoke
-- direct calls to application routines, including existing trigger functions.
DO $$
DECLARE
  app_routine record;
BEGIN
  FOR app_routine IN
    SELECT namespace.nspname, routine.proname,
           pg_get_function_identity_arguments(routine.oid) AS arguments
    FROM pg_proc AS routine
    JOIN pg_namespace AS namespace ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend AS dependency
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

-- Existing ordinary and partitioned application tables must also deny rows
-- if a future grant is added. Extension-owned tables are managed separately.
DO $$
DECLARE
  app_table record;
BEGIN
  FOR app_table IN
    SELECT format('%I.%I', namespace.nspname, relation.relname) AS name
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend AS dependency
        WHERE dependency.classid = 'pg_class'::regclass
          AND dependency.objid = relation.oid
          AND dependency.deptype = 'e'
      )
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', app_table.name);
  END LOOP;
END;
$$;

-- Supabase's historical public-schema defaults grant new objects to Data API
-- roles. Remove those defaults for the role that applies these migrations.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- These SECURITY INVOKER triggers use only built-ins and public CRM tables.
-- Fix their search path without replacing their implementation or triggers.
DO $$
DECLARE
  function_name text;
BEGIN
  FOREACH function_name IN ARRAY ARRAY[
    'enforce_single_level_project_nesting',
    'reject_project_status_definition_change',
    'require_active_project_status',
    'synchronize_legacy_user_role_assignment'
  ] LOOP
    IF to_regprocedure(format('public.%I()', function_name)) IS NOT NULL THEN
      EXECUTE format(
        'ALTER FUNCTION public.%I() SET search_path = pg_catalog, public',
        function_name
      );
    END IF;
  END LOOP;
END;
$$;

COMMIT;
