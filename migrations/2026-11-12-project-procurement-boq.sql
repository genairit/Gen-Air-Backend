BEGIN;

CREATE TABLE project_boqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE REFERENCES projects(id) ON DELETE RESTRICT,
  source_quotation_id uuid REFERENCES quotations(id) ON DELETE RESTRICT,
  source_quotation_version integer,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_by_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT chk_project_boq_source CHECK ((source_quotation_id IS NULL) = (source_quotation_version IS NULL))
);

CREATE TABLE project_boq_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boq_id uuid NOT NULL REFERENCES project_boqs(id) ON DELETE RESTRICT,
  material_id uuid NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  source_key varchar(200) NOT NULL,
  system_title varchar(200) NOT NULL DEFAULT '',
  component_title varchar(300) NOT NULL DEFAULT '',
  material_code varchar(100) NOT NULL,
  material_name varchar(200) NOT NULL,
  material_category varchar(100) NOT NULL,
  material_specification varchar(300),
  material_unit varchar(12) NOT NULL,
  source_basis varchar(24) NOT NULL,
  proposed_quantity numeric(16,8),
  required_quantity numeric(16,8),
  quantity_overridden boolean NOT NULL DEFAULT false,
  estimated_unit_cost numeric(16,4),
  review_state varchar(20) NOT NULL DEFAULT 'pending',
  notes varchar(1000) NOT NULL DEFAULT '',
  source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  display_order integer NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT uq_project_boq_line_source UNIQUE (boq_id, source_key),
  CONSTRAINT chk_project_boq_quantity CHECK (proposed_quantity IS NULL OR (proposed_quantity >= 0 AND proposed_quantity < 'Infinity'::numeric)),
  CONSTRAINT chk_project_boq_required CHECK (required_quantity IS NULL OR (required_quantity >= 0 AND required_quantity < 'Infinity'::numeric)),
  CONSTRAINT chk_project_boq_cost CHECK (estimated_unit_cost IS NULL OR (estimated_unit_cost >= 0 AND estimated_unit_cost < 'Infinity'::numeric)),
  CONSTRAINT chk_project_boq_review CHECK (review_state IN ('pending', 'confirmed')),
  CONSTRAINT chk_project_boq_basis CHECK (source_basis IN ('fixed', 'conditional', 'project_measurement', 'manual'))
);

CREATE TABLE project_boq_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boq_id uuid NOT NULL REFERENCES project_boqs(id) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK (revision > 0),
  source_quotation_id uuid REFERENCES quotations(id) ON DELETE RESTRICT,
  source_quotation_version integer,
  lines jsonb NOT NULL CHECK (jsonb_typeof(lines) = 'array'),
  created_by_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT uq_project_boq_revision UNIQUE (boq_id, revision)
);

CREATE OR REPLACE FUNCTION prevent_project_boq_revision_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'project BOQ revisions are immutable';
END;
$$;
CREATE TRIGGER trg_project_boq_revision_immutable
BEFORE UPDATE OR DELETE ON project_boq_revisions
FOR EACH ROW EXECUTE FUNCTION prevent_project_boq_revision_change();

CREATE INDEX idx_project_boq_lines_boq_order ON project_boq_lines (boq_id, display_order);
CREATE INDEX idx_project_boq_lines_material ON project_boq_lines (material_id);
CREATE INDEX idx_project_boq_revisions_boq ON project_boq_revisions (boq_id, revision DESC);

ALTER TABLE project_boqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_boq_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_boq_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON project_boqs, project_boq_lines, project_boq_revisions FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON project_boqs, project_boq_lines, project_boq_revisions FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON project_boqs, project_boq_lines, project_boq_revisions FROM authenticated;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='permissions' AND column_name='feature') THEN
    INSERT INTO permissions (key, feature, action) VALUES ('project_boq.read', 'project_boq', 'read'), ('project_boq.manage', 'project_boq', 'manage') ON CONFLICT (key) DO NOTHING;
  ELSE
    INSERT INTO permissions (key) VALUES ('project_boq.read'), ('project_boq.manage') ON CONFLICT (key) DO NOTHING;
  END IF;
END $$;
INSERT INTO role_permissions (role, permission_key) VALUES
  ('purchasing_execution_manager', 'project_boq.read'),
  ('purchasing_execution_manager', 'project_boq.manage'),
  ('system_admin', 'project_boq.read'),
  ('system_admin', 'project_boq.manage')
ON CONFLICT (role, permission_key) DO NOTHING;

COMMIT;
