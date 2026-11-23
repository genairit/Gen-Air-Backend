BEGIN;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS drive_folder_linked boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_live_drive_folder
ON public.projects (drive_folder_id)
WHERE deleted_at IS NULL AND drive_folder_id IS NOT NULL;
COMMIT;
