-- Purpose: replace legacy project BOQs with named documents; apply before deploying the new backend.
-- The name column marks completion so rerunning this migration preserves new documents.
BEGIN;
LOCK TABLE project_boqs, project_boq_lines, project_boq_revisions IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'project_boqs' AND column_name = 'name'
  ) THEN
    ALTER TABLE project_boq_revisions DISABLE TRIGGER trg_project_boq_revision_immutable;
    DELETE FROM project_boq_revisions;
    ALTER TABLE project_boq_revisions ENABLE TRIGGER trg_project_boq_revision_immutable;
    DELETE FROM project_boq_lines;
    DELETE FROM project_boqs;
    ALTER TABLE project_boqs DROP CONSTRAINT project_boqs_project_id_key;
    ALTER TABLE project_boqs ADD COLUMN name varchar(200) NOT NULL DEFAULT 'כתב רכש כללי';
    ALTER TABLE project_boqs ADD CONSTRAINT chk_project_boq_name CHECK (length(trim(name)) > 0);
    CREATE INDEX idx_project_boqs_project_created ON project_boqs (project_id, created_at, id);
  END IF;
END;
$$;
COMMIT;
