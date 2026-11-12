-- Purpose: keep engineering assignments on apartments instead of residential parents.
-- Date: 2026-11-09
-- Apply before deploying the matching backend. The transaction copies effective
-- inherited engineers before removing building slots.

BEGIN;
LOCK TABLE public.projects, public.project_members IN SHARE ROW EXCLUSIVE MODE;

INSERT INTO public.project_members (id, project_id, user_id, role, created_at, updated_at)
SELECT gen_random_uuid(), apartment.id, engineer.user_id, 'engineer', now(), now()
FROM public.projects apartment
JOIN public.projects building ON building.id = apartment.parent_project_id
JOIN public.project_types type ON type.id = building.project_type_id
JOIN public.project_members engineer
  ON engineer.project_id = building.id AND engineer.role = 'engineer'
WHERE apartment.has_own_team = false
  AND building.parent_project_id IS NULL
  AND type.can_have_apartments = true
ON CONFLICT (project_id, role) DO NOTHING;

DELETE FROM public.project_members member
USING public.projects building, public.project_types type
WHERE member.project_id = building.id
  AND member.role = 'engineer'
  AND building.parent_project_id IS NULL
  AND building.project_type_id = type.id
  AND type.can_have_apartments = true;

CREATE OR REPLACE FUNCTION public.reject_residential_building_engineer()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.role = 'engineer' AND EXISTS (
    SELECT 1 FROM public.projects project
    JOIN public.project_types type ON type.id = project.project_type_id
    WHERE project.id = NEW.project_id
      AND project.parent_project_id IS NULL
      AND type.can_have_apartments = true
  ) THEN
    RAISE EXCEPTION 'Assign engineering workers to apartments, not their parent building'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_members_engineer_apartment_only ON public.project_members;
CREATE TRIGGER project_members_engineer_apartment_only
  BEFORE INSERT OR UPDATE OF project_id, role ON public.project_members
  FOR EACH ROW EXECUTE FUNCTION public.reject_residential_building_engineer();

CREATE OR REPLACE FUNCTION public.reject_residential_type_with_engineer()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.parent_project_id IS NULL
    AND EXISTS (
      SELECT 1 FROM public.project_types type
      WHERE type.id = NEW.project_type_id AND type.can_have_apartments = true
    )
    AND EXISTS (
      SELECT 1 FROM public.project_members member
      WHERE member.project_id = NEW.id AND member.role = 'engineer'
    ) THEN
    RAISE EXCEPTION 'Remove the building engineer before changing to a residential type'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS projects_residential_engineer_guard ON public.projects;
CREATE TRIGGER projects_residential_engineer_guard
  BEFORE UPDATE OF project_type_id, parent_project_id ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.reject_residential_type_with_engineer();

COMMIT;
