-- Apartments inherit the building lighting values until explicitly overridden.
ALTER TABLE public.projects
  ADD COLUMN has_own_lighting boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT chk_projects_own_lighting_apartment
    CHECK (NOT has_own_lighting OR parent_project_id IS NOT NULL);
