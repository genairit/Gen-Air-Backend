-- Purpose: replace quotations.project_id with a normalized quotation-project association,
-- so one saved quotation can be listed under its building and selected apartments.
-- Date: 2026-11-09
-- Apply during a maintenance window after stopping every old backend replica.
-- Start only the matching backend revision after this transaction commits.
BEGIN;

CREATE TABLE IF NOT EXISTS quotation_projects (
  quotation_id uuid NOT NULL,
  project_id uuid NOT NULL,
  is_primary boolean NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT pk_quotation_projects PRIMARY KEY (quotation_id, project_id),
  CONSTRAINT fk_quotation_projects_quotation FOREIGN KEY (quotation_id) REFERENCES quotations(id),
  CONSTRAINT fk_quotation_projects_project FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_quotation_projects_primary
  ON quotation_projects (quotation_id) WHERE is_primary;
CREATE INDEX IF NOT EXISTS idx_quotation_projects_project_id
  ON quotation_projects (project_id);

DO $$
DECLARE
  expected_links integer;
  migrated_links integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quotations' AND column_name = 'project_id'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO quotation_projects (quotation_id, project_id, is_primary, created_at, updated_at)
  SELECT id, project_id, true, created_at, updated_at
  FROM quotations
  WHERE project_id IS NOT NULL
  ON CONFLICT (quotation_id, project_id) DO NOTHING;

  SELECT count(*) INTO expected_links FROM quotations WHERE project_id IS NOT NULL;
  SELECT count(*) INTO migrated_links
  FROM quotations AS quotation
  JOIN quotation_projects AS link
    ON link.quotation_id = quotation.id
   AND link.project_id = quotation.project_id
   AND link.is_primary;

  IF expected_links <> migrated_links THEN
    RAISE EXCEPTION 'quotation_projects migration copied % of % primary links', migrated_links, expected_links;
  END IF;

  ALTER TABLE quotations DROP COLUMN project_id;
END $$;

ALTER TABLE quotation_projects ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON quotation_projects FROM PUBLIC;

DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON quotation_projects FROM anon; END IF; IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON quotation_projects FROM authenticated; END IF; END $$;

COMMIT;
