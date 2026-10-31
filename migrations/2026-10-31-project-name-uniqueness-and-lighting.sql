-- Exact active-project names, including apartments; outer whitespace follows String.trim().
BEGIN;
LOCK TABLE public.projects IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.projects WHERE deleted_at IS NULL
    GROUP BY btrim(name, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') COLLATE "C" HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Active project names conflict after outer-space trimming. Run the documented inventory and resolve explicitly before retrying.';
  END IF;
END $$;

ALTER TABLE public.projects
  ADD COLUMN has_general_lighting_ceiling_lowering boolean NOT NULL DEFAULT false,
  ADD COLUMN general_lighting_ceiling_lowering_height double precision,
  ADD CONSTRAINT chk_projects_lighting_height CHECK (
    (NOT has_general_lighting_ceiling_lowering AND general_lighting_ceiling_lowering_height IS NULL)
    OR (has_general_lighting_ceiling_lowering AND general_lighting_ceiling_lowering_height IS NOT NULL
      AND general_lighting_ceiling_lowering_height >= 0
      AND general_lighting_ceiling_lowering_height < 'Infinity'::double precision)
  );

CREATE UNIQUE INDEX uq_projects_active_exact_name
  ON public.projects ((btrim(name, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') COLLATE "C")) WHERE deleted_at IS NULL;
COMMIT;
