-- Purpose: record the current urgency marker and time, and support task-list ordering.
-- Date: 2026-10-14
-- Apply after 2026-10-13-add-tasks-table.sql, before deploying this API.
-- Legacy urgent rows retain unknown audit fields; do not invent an actor or time.
-- Existing nullable due dates/descriptions remain valid; creation rules are enforced by the API.
-- Rollback requires reverting the API first, dropping the index and both new columns.
BEGIN;
ALTER TABLE tasks
  ADD COLUMN urgency_marked_by_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN urgency_marked_at TIMESTAMPTZ(3),
  ADD CONSTRAINT chk_tasks_urgency_audit_pair CHECK ((urgency_marked_by_id IS NULL) = (urgency_marked_at IS NULL)),
  ADD CONSTRAINT chk_tasks_nonurgent_audit_empty CHECK (is_urgent OR (urgency_marked_by_id IS NULL AND urgency_marked_at IS NULL));
CREATE INDEX idx_tasks_urgency_due_date ON tasks (is_urgent DESC, due_date ASC NULLS LAST, id ASC) WHERE deleted_at IS NULL;
COMMIT;
