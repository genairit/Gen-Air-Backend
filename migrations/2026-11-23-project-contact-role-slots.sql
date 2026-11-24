BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_contact_role_slot
ON public.project_contact_links (project_id, role)
WHERE role IN ('architect', 'project_manager', 'consultant');

COMMIT;
