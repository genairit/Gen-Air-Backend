-- Date: 2026-10-16
-- Replace global stages with a fixed catalog. Reset every existing project to ממתין.
-- Run with the application stopped; preserves old definitions/history and assignment snapshots.
BEGIN;
LOCK TABLE project_stages, projects IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE IF NOT EXISTS project_stage_reset_snapshots (
  project_id UUID PRIMARY KEY REFERENCES projects(id),
  previous_stage_id UUID NOT NULL REFERENCES project_stages(id),
  previous_updated_at TIMESTAMPTZ(3) NOT NULL,
  migrated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION reject_project_status_definition_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Project status definitions are fixed' USING ERRCODE = '23514';
END;
$$;

CREATE OR REPLACE FUNCTION require_active_project_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM project_stages WHERE id = NEW.stage_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Choose an active fixed project status' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  -- The trigger marks a completed migration: reruns must not reset projects again.
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'project_stages'::regclass AND tgname = 'project_stages_readonly' AND NOT tgisinternal) THEN
    RETURN;
  END IF;

  INSERT INTO project_stage_reset_snapshots (project_id, previous_stage_id, previous_updated_at)
    SELECT id, stage_id, updated_at FROM projects;

  UPDATE project_stages SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE deleted_at IS NULL;

  INSERT INTO project_stages (id, name, description, tag, color, position) VALUES
    ('6502a045-2a7d-4bc8-8ba1-36eaedc49a01','ממתין',NULL,NULL,'#8A8D93',1),
    ('6502a045-2a7d-4bc8-8ba1-36eaedc49a02','בעבודה',NULL,NULL,'#FF5A36',2),
    ('6502a045-2a7d-4bc8-8ba1-36eaedc49a03','להמתין',NULL,NULL,'#1E2022',3),
    ('6502a045-2a7d-4bc8-8ba1-36eaedc49a04','הסתיים',NULL,NULL,'#237A57',4);

  UPDATE projects SET stage_id = '6502a045-2a7d-4bc8-8ba1-36eaedc49a01', updated_at = CURRENT_TIMESTAMP;
  ALTER TABLE projects ALTER COLUMN stage_id SET DEFAULT '6502a045-2a7d-4bc8-8ba1-36eaedc49a01'::uuid;

  CREATE TRIGGER project_stages_readonly
    BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON project_stages
    FOR EACH STATEMENT EXECUTE FUNCTION reject_project_status_definition_change();
  CREATE TRIGGER projects_require_active_status
    BEFORE INSERT OR UPDATE OF stage_id ON projects
    FOR EACH ROW EXECUTE FUNCTION require_active_project_status();
END;
$$;
COMMIT;
