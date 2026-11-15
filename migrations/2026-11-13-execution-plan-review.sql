-- Apply after 2026-11-13-add-engineering-lead-role.sql commits.
-- The API's private database role owns these tables; no Data API access is granted.
BEGIN;

CREATE TABLE execution_plan_checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL UNIQUE CHECK (version > 0),
  items jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array'),
  created_at timestamptz(3) NOT NULL DEFAULT now()
);

INSERT INTO execution_plan_checklist_templates (version, items) VALUES
  (1, '[{"key":"indoor_btu","label":"יחידות פנים — BTU מספיק"},{"key":"cfm_distribution","label":"פיזור CFM"},{"key":"condenser_location","label":"מעבה ומיקום"},{"key":"ceiling_height","label":"גבהי הנמכה"},{"key":"return_air","label":"חישוב אוויר חוזר"},{"key":"forced_ventilation","label":"אוורור מאולץ"}]'::jsonb);

CREATE TABLE execution_plan_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id uuid NOT NULL REFERENCES quotations(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  drive_file_id varchar(200) NOT NULL,
  drive_file_version varchar(40) NOT NULL,
  drive_file_name varchar(500) NOT NULL,
  plan_version varchar(100) NOT NULL,
  template_version integer NOT NULL REFERENCES execution_plan_checklist_templates(version),
  checklist jsonb NOT NULL CHECK (jsonb_typeof(checklist) = 'array'),
  status varchar(20) NOT NULL DEFAULT 'draft',
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  submitted_by_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  submitted_at timestamptz(3),
  reviewed_by_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_at timestamptz(3),
  return_comment varchar(2000),
  supersedes_id uuid REFERENCES execution_plan_submissions(id) ON DELETE RESTRICT,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT chk_execution_plan_status CHECK (status IN ('draft', 'pending', 'approved', 'returned', 'cancelled')),
  CONSTRAINT chk_execution_plan_submitted_at CHECK (
    (status = 'draft' AND submitted_at IS NULL) OR
    (status IN ('pending', 'approved', 'returned') AND submitted_at IS NOT NULL) OR
    status = 'cancelled'
  ),
  CONSTRAINT chk_execution_plan_review CHECK (
    (status IN ('approved', 'returned')) = (reviewed_by_id IS NOT NULL AND reviewed_at IS NOT NULL)
  ),
  CONSTRAINT chk_execution_plan_return_comment CHECK (
    (status = 'returned') = (return_comment IS NOT NULL AND length(btrim(return_comment)) > 0)
  ),
  CONSTRAINT chk_execution_plan_self_review CHECK (
    reviewed_by_id IS NULL OR reviewed_by_id <> submitted_by_id
  )
);

CREATE UNIQUE INDEX uq_execution_plan_active_context
  ON execution_plan_submissions (quotation_id, project_id)
  WHERE status IN ('draft', 'pending');
CREATE INDEX idx_execution_plan_pending ON execution_plan_submissions (submitted_at DESC, id)
  WHERE status = 'pending';
CREATE INDEX idx_execution_plan_quotation ON execution_plan_submissions (quotation_id, created_at DESC);
CREATE INDEX idx_execution_plan_project ON execution_plan_submissions (project_id, created_at DESC);

ALTER TABLE execution_plan_checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution_plan_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON execution_plan_checklist_templates, execution_plan_submissions FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON execution_plan_checklist_templates, execution_plan_submissions FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON execution_plan_checklist_templates, execution_plan_submissions FROM authenticated;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='permissions' AND column_name='feature') THEN
    INSERT INTO permissions (key, feature, action) VALUES
      ('execution_plans.read', 'execution_plans', 'read'),
      ('execution_plans.submit', 'execution_plans', 'submit'),
      ('execution_plans.approve', 'execution_plans', 'approve')
    ON CONFLICT (key) DO NOTHING;
  ELSE
    INSERT INTO permissions (key) VALUES
      ('execution_plans.read'), ('execution_plans.submit'), ('execution_plans.approve')
    ON CONFLICT (key) DO NOTHING;
  END IF;
END $$;

INSERT INTO role_permissions (role, permission_key) VALUES
  ('engineer', 'execution_plans.read'),
  ('engineer', 'execution_plans.submit'),
  ('engineering_lead', 'projects.read'),
  ('engineering_lead', 'quotations.read'),
  ('engineering_lead', 'drive.read'),
  ('engineering_lead', 'execution_plans.read'),
  ('engineering_lead', 'execution_plans.approve'),
  ('system_admin', 'execution_plans.read'),
  ('system_admin', 'execution_plans.submit'),
  ('system_admin', 'execution_plans.approve')
ON CONFLICT (role, permission_key) DO NOTHING;

COMMIT;
