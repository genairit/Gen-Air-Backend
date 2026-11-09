-- Replace the five active project statuses with the engineering team's four statuses.
-- Keep renamed definitions for historical transition labels. Apply before the new backend.
BEGIN;
LOCK TABLE public.project_stages, public.projects, public.project_stage_transitions IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE IF NOT EXISTS public.project_status_change_snapshots (
  project_id UUID PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  previous_stage_id UUID NOT NULL REFERENCES public.project_stages(id),
  previous_updated_at TIMESTAMPTZ(3) NOT NULL,
  migrated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.project_status_change_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.project_status_change_snapshots FROM PUBLIC;

DO $$
DECLARE api_role text;
BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.project_status_change_snapshots FROM %I', api_role);
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.project_stages
    WHERE id = '6502a045-2a7d-4bc8-8ba1-36eaedc49a05'::uuid AND deleted_at IS NULL
  ) THEN
    IF (SELECT count(*) FROM public.project_stages WHERE deleted_at IS NULL) = 4
      AND NOT EXISTS (
        SELECT 1 FROM (VALUES
          ('6502a045-2a7d-4bc8-8ba1-36eaedc49a05'::uuid, 'טרם בעבודה', 0),
          ('6502a045-2a7d-4bc8-8ba1-36eaedc49a02'::uuid, 'בעבודה', 1),
          ('6502a045-2a7d-4bc8-8ba1-36eaedc49a06'::uuid, 'מחכה לתשובה', 2),
          ('6502a045-2a7d-4bc8-8ba1-36eaedc49a07'::uuid, 'הושלם', 3)
        ) AS expected(id, name, position)
        LEFT JOIN public.project_stages s ON s.id = expected.id
        WHERE s.id IS NULL OR s.deleted_at IS NOT NULL
          OR s.name <> expected.name OR s.position <> expected.position
      ) THEN
      RETURN;
    END IF;

    RAISE EXCEPTION 'Four-status catalog is incomplete; inspect before retrying';
  END IF;

  IF (SELECT count(*) FROM public.project_stages WHERE deleted_at IS NULL) <> 5
    OR EXISTS (
      SELECT 1 FROM (VALUES
        ('6502a045-2a7d-4bc8-8ba1-36eaedc49a00'::uuid, 'טיוטה', 0),
        ('6502a045-2a7d-4bc8-8ba1-36eaedc49a01'::uuid, 'ממתין', 1),
        ('6502a045-2a7d-4bc8-8ba1-36eaedc49a02'::uuid, 'בעבודה', 2),
        ('6502a045-2a7d-4bc8-8ba1-36eaedc49a03'::uuid, 'להמתין', 3),
        ('6502a045-2a7d-4bc8-8ba1-36eaedc49a04'::uuid, 'הסתיים', 4)
      ) AS expected(id, name, position)
      LEFT JOIN public.project_stages s ON s.id = expected.id
      WHERE s.id IS NULL OR s.deleted_at IS NOT NULL
        OR s.name <> expected.name OR s.position <> expected.position
    )
    OR EXISTS (
      SELECT 1 FROM public.project_stages
      WHERE id IN (
        '6502a045-2a7d-4bc8-8ba1-36eaedc49a05'::uuid,
        '6502a045-2a7d-4bc8-8ba1-36eaedc49a06'::uuid,
        '6502a045-2a7d-4bc8-8ba1-36eaedc49a07'::uuid
      )
    ) THEN
    RAISE EXCEPTION 'Unexpected project status catalog; inspect before migrating';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.projects WHERE stage_id NOT IN (
      '6502a045-2a7d-4bc8-8ba1-36eaedc49a00'::uuid,
      '6502a045-2a7d-4bc8-8ba1-36eaedc49a01'::uuid,
      '6502a045-2a7d-4bc8-8ba1-36eaedc49a02'::uuid,
      '6502a045-2a7d-4bc8-8ba1-36eaedc49a03'::uuid,
      '6502a045-2a7d-4bc8-8ba1-36eaedc49a04'::uuid
    )
  ) THEN
    RAISE EXCEPTION 'Projects reference retired statuses; inspect before migrating';
  END IF;

  INSERT INTO public.project_status_change_snapshots
    (project_id, previous_stage_id, previous_updated_at)
    SELECT id, stage_id, updated_at FROM public.projects
    WHERE stage_id IN (
      '6502a045-2a7d-4bc8-8ba1-36eaedc49a00'::uuid,
      '6502a045-2a7d-4bc8-8ba1-36eaedc49a01'::uuid,
      '6502a045-2a7d-4bc8-8ba1-36eaedc49a03'::uuid,
      '6502a045-2a7d-4bc8-8ba1-36eaedc49a04'::uuid
    );

  DROP TRIGGER project_stages_readonly ON public.project_stages;

  UPDATE public.project_stages
  SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
  WHERE id IN (
    '6502a045-2a7d-4bc8-8ba1-36eaedc49a00'::uuid,
    '6502a045-2a7d-4bc8-8ba1-36eaedc49a01'::uuid,
    '6502a045-2a7d-4bc8-8ba1-36eaedc49a03'::uuid,
    '6502a045-2a7d-4bc8-8ba1-36eaedc49a04'::uuid
  );

  UPDATE public.project_stages SET position = 1, updated_at = CURRENT_TIMESTAMP
  WHERE id = '6502a045-2a7d-4bc8-8ba1-36eaedc49a02'::uuid;

  INSERT INTO public.project_stages (id, name, description, tag, color, position) VALUES
    ('6502a045-2a7d-4bc8-8ba1-36eaedc49a05', 'טרם בעבודה', NULL, NULL, '#A3A6AD', 0),
    ('6502a045-2a7d-4bc8-8ba1-36eaedc49a06', 'מחכה לתשובה', NULL, NULL, '#1E2022', 2),
    ('6502a045-2a7d-4bc8-8ba1-36eaedc49a07', 'הושלם', NULL, NULL, '#237A57', 3);

  UPDATE public.projects
  SET stage_id = CASE stage_id
    WHEN '6502a045-2a7d-4bc8-8ba1-36eaedc49a00'::uuid THEN '6502a045-2a7d-4bc8-8ba1-36eaedc49a05'::uuid
    WHEN '6502a045-2a7d-4bc8-8ba1-36eaedc49a01'::uuid THEN '6502a045-2a7d-4bc8-8ba1-36eaedc49a05'::uuid
    WHEN '6502a045-2a7d-4bc8-8ba1-36eaedc49a03'::uuid THEN '6502a045-2a7d-4bc8-8ba1-36eaedc49a06'::uuid
    WHEN '6502a045-2a7d-4bc8-8ba1-36eaedc49a04'::uuid THEN '6502a045-2a7d-4bc8-8ba1-36eaedc49a07'::uuid
  END
  WHERE stage_id IN (
    '6502a045-2a7d-4bc8-8ba1-36eaedc49a00'::uuid,
    '6502a045-2a7d-4bc8-8ba1-36eaedc49a01'::uuid,
    '6502a045-2a7d-4bc8-8ba1-36eaedc49a03'::uuid,
    '6502a045-2a7d-4bc8-8ba1-36eaedc49a04'::uuid
  );

  ALTER TABLE public.projects ALTER COLUMN stage_id
    SET DEFAULT '6502a045-2a7d-4bc8-8ba1-36eaedc49a05'::uuid;

  CREATE TRIGGER project_stages_readonly
    BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.project_stages
    FOR EACH STATEMENT EXECUTE FUNCTION public.reject_project_status_definition_change();
END;
$$;
COMMIT;
