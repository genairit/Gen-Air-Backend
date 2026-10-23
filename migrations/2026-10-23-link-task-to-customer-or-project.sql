-- Purpose: let a task link to a customer or to a project instead of always both.
-- Date: 2026-10-23
-- Apply after 2026-10-14-reconcile-task-design.sql, before deploying this API.
-- New tasks store exactly one link (enforced by the API); a project task reads its customer through the project.
-- Legacy rows that reference both keep both links unchanged and are treated as project tasks.
-- Rollback requires reverting the API first and backfilling customer_id/project_id before restoring NOT NULL.
BEGIN;

ALTER TABLE tasks
  ALTER COLUMN project_id DROP NOT NULL,
  ALTER COLUMN customer_id DROP NOT NULL,
  ADD CONSTRAINT chk_tasks_has_link CHECK (project_id IS NOT NULL OR customer_id IS NOT NULL);

CREATE INDEX idx_tasks_customer_id ON tasks (customer_id) WHERE deleted_at IS NULL;

COMMIT;
