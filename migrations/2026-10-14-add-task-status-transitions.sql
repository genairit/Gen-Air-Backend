-- Purpose: record every task status change (who, from, to, when) for the task screen's status history.
-- Date: 2026-10-14
-- Apply after 2026-10-14-reconcile-task-design.sql, before deploying this API.
-- History starts at deployment: existing tasks get no rows; a task with no creation row (from_status IS NULL)
-- is shown as created before the history existed.
-- Rollback (only before the history holds data): DROP TABLE task_status_transitions;
BEGIN;

CREATE TABLE task_status_transitions (
  id            UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       UUID            NOT NULL REFERENCES tasks (id) ON DELETE RESTRICT,
  from_status   task_status,
  to_status     task_status     NOT NULL,
  changed_by_id UUID            NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at    TIMESTAMPTZ(3)  NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_task_status_transitions_changes CHECK (from_status IS DISTINCT FROM to_status)
);

CREATE INDEX idx_task_status_transitions_task_created ON task_status_transitions (task_id, created_at);

COMMIT;
