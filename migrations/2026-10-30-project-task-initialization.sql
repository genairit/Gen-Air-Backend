-- Add project-only task types and the Draft initial project status.
-- Existing tasks remain General; existing projects and work are not backfilled.
BEGIN;
LOCK TABLE public.tasks, public.projects, public.project_stages IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
                 WHERE n.nspname='public' AND t.typname='enum_tasks_task_type') THEN
    CREATE TYPE public.enum_tasks_task_type AS ENUM ('quotation','planning','general');
  END IF;
  IF (SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder)
      FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
      JOIN pg_namespace n ON n.oid=t.typnamespace
      WHERE n.nspname='public' AND t.typname='enum_tasks_task_type')
      IS DISTINCT FROM ARRAY['quotation','planning','general']::text[] THEN
    RAISE EXCEPTION 'Unexpected task type catalog; inspect before migrating';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tasks WHERE char_length(title)>212) THEN
    RAISE EXCEPTION 'Task titles exceed supported storage width; inspect before migrating';
  END IF;
END;
$$;

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS task_type public.enum_tasks_task_type NOT NULL DEFAULT 'general';
ALTER TABLE public.tasks ALTER COLUMN title TYPE VARCHAR(212);
ALTER TABLE public.tasks ALTER COLUMN due_date DROP NOT NULL;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tasks FROM PUBLIC;

DO $$
DECLARE api_role text;
BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.tasks FROM %I',api_role);
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.tasks'::regclass AND conname='chk_tasks_protected_project') THEN
    ALTER TABLE public.tasks ADD CONSTRAINT chk_tasks_protected_project
      CHECK (task_type='general' OR (project_id IS NOT NULL AND customer_id IS NULL));
  END IF;
END;
$$;

-- No status/deletion filter: a protected type's lifetime slot is never freed.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_project_protected_type ON public.tasks(project_id,task_type)
  WHERE task_type IN ('quotation','planning');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('6502a045-2a7d-4bc8-8ba1-36eaedc49a01'::uuid,'ממתין',1),
      ('6502a045-2a7d-4bc8-8ba1-36eaedc49a02'::uuid,'בעבודה',2),
      ('6502a045-2a7d-4bc8-8ba1-36eaedc49a03'::uuid,'להמתין',3),
      ('6502a045-2a7d-4bc8-8ba1-36eaedc49a04'::uuid,'הסתיים',4)
    ) AS expected(id,name,position)
    LEFT JOIN public.project_stages s ON s.id=expected.id
    WHERE s.id IS NULL OR s.deleted_at IS NOT NULL OR s.name<>expected.name OR s.position<>expected.position
  ) THEN
    RAISE EXCEPTION 'Apply fixed-project-statuses before project-task initialization';
  END IF;
  IF EXISTS (SELECT 1 FROM public.project_stages WHERE deleted_at IS NULL AND id NOT IN (
    '6502a045-2a7d-4bc8-8ba1-36eaedc49a00'::uuid,
    '6502a045-2a7d-4bc8-8ba1-36eaedc49a01'::uuid,
    '6502a045-2a7d-4bc8-8ba1-36eaedc49a02'::uuid,
    '6502a045-2a7d-4bc8-8ba1-36eaedc49a03'::uuid,
    '6502a045-2a7d-4bc8-8ba1-36eaedc49a04'::uuid
  )) THEN
    RAISE EXCEPTION 'Unexpected active project statuses; inspect before migrating';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS project_stages_readonly ON public.project_stages;
INSERT INTO public.project_stages(id,name,description,tag,color,position,deleted_at)
VALUES ('6502a045-2a7d-4bc8-8ba1-36eaedc49a00','טיוטה',NULL,NULL,'#A3A6AD',0,NULL)
ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,position=EXCLUDED.position,deleted_at=NULL,updated_at=CURRENT_TIMESTAMP;
CREATE TRIGGER project_stages_readonly
  BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.project_stages
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_project_status_definition_change();
ALTER TABLE public.projects ALTER COLUMN stage_id SET DEFAULT '6502a045-2a7d-4bc8-8ba1-36eaedc49a00'::uuid;
COMMIT;
