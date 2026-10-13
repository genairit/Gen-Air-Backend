-- Purpose: add project/customer tasks and indexes for the personal dashboard.
-- Date: 2026-10-13
-- Apply after the CRM baseline and 2026-10-13-add-customers-table.sql.
-- is_urgent changing from false to true is the future notification trigger;
-- notification dispatch and task-module validation are separate tasks.
-- Hard deletes of referenced records are restricted to preserve task history.
-- Rollback (only before tasks hold data): DROP TABLE tasks; DROP TYPE task_status;

BEGIN;

CREATE TYPE task_status AS ENUM (
  'waiting_for_response', -- מחכה לתשובה
  'not_started',          -- טרם בעבודה
  'in_progress',          -- בעבודה
  'in_review',            -- בבדיקה
  'proposal_sent'         -- נשלחה הצעה
);

CREATE TABLE tasks (
  id            UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID           NOT NULL REFERENCES projects (id) ON DELETE RESTRICT,
  customer_id   UUID           NOT NULL REFERENCES customers (id) ON DELETE RESTRICT,
  assignee_id   UUID           REFERENCES users (id) ON DELETE RESTRICT,
  created_by_id UUID           NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  title         VARCHAR(200)   NOT NULL CHECK (title ~ '[^[:space:]]'),
  description   TEXT,
  status        task_status    NOT NULL DEFAULT 'not_started',
  is_urgent     BOOLEAN        NOT NULL DEFAULT FALSE,
  due_date      TIMESTAMPTZ(3),
  created_at    TIMESTAMPTZ(3)  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ(3)  NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ(3)
);

CREATE INDEX idx_tasks_assignee_id_status ON tasks (assignee_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_project_id ON tasks (project_id) WHERE deleted_at IS NULL;

COMMIT;
