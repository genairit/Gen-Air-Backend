BEGIN;

CREATE TABLE suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL CHECK (length(trim(name)) > 0),
  contact_name varchar(120),
  phone varchar(32),
  email varchar(254),
  notes varchar(1000) NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now()
);

CREATE INDEX idx_suppliers_name ON suppliers (name);

CREATE TABLE project_supplier_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  boq_source_key varchar(200) NOT NULL,
  material_id uuid NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  material_unit varchar(12) NOT NULL,
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  unit_price numeric(16,4) NOT NULL CHECK (unit_price >= 0),
  currency_code varchar(3) NOT NULL CHECK (currency_code IN ('ILS', 'USD', 'EUR')),
  agreed_quantity numeric(16,8) CHECK (agreed_quantity IS NULL OR agreed_quantity > 0),
  effective_from date,
  effective_through date,
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  notes varchar(1000) NOT NULL DEFAULT '',
  created_by_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT uq_project_supplier_agreement UNIQUE (project_id, boq_source_key, supplier_id, material_id, material_unit),
  CONSTRAINT chk_supplier_agreement_dates CHECK (effective_from IS NULL OR effective_through IS NULL OR effective_from <= effective_through)
);

CREATE INDEX idx_project_supplier_agreements_project ON project_supplier_agreements (project_id, boq_source_key);
CREATE INDEX idx_project_supplier_agreements_supplier ON project_supplier_agreements (supplier_id);

CREATE TABLE project_supplier_agreement_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id uuid NOT NULL REFERENCES project_supplier_agreements(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  snapshot jsonb NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT uq_project_supplier_agreement_revision UNIQUE (agreement_id, version)
);

CREATE OR REPLACE FUNCTION prevent_supplier_agreement_revision_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'supplier agreement revisions are immutable';
END;
$$;
CREATE TRIGGER trg_supplier_agreement_revisions_immutable
  BEFORE UPDATE OR DELETE ON project_supplier_agreement_revisions
  FOR EACH ROW EXECUTE FUNCTION prevent_supplier_agreement_revision_change();

ALTER TABLE purchase_records
  ADD COLUMN supplier_id uuid REFERENCES suppliers(id) ON DELETE RESTRICT,
  ADD COLUMN supplier_contact_name varchar(120),
  ADD COLUMN supplier_phone varchar(32),
  ADD COLUMN supplier_email varchar(254);

ALTER TABLE purchase_record_lines
  ADD COLUMN supplier_agreement_id uuid REFERENCES project_supplier_agreements(id) ON DELETE RESTRICT,
  ADD COLUMN supplier_agreement_version integer;

ALTER TABLE purchase_record_lines
  ADD CONSTRAINT chk_purchase_line_agreement_version CHECK (
    (supplier_agreement_id IS NULL AND supplier_agreement_version IS NULL) OR
    (supplier_agreement_id IS NOT NULL AND supplier_agreement_version > 0)
  );

CREATE TABLE purchase_order_line_terms (
  record_line_id uuid PRIMARY KEY REFERENCES purchase_record_lines(id) ON DELETE RESTRICT,
  supplier_agreement_id uuid NOT NULL REFERENCES project_supplier_agreements(id) ON DELETE RESTRICT,
  supplier_agreement_version integer NOT NULL CHECK (supplier_agreement_version > 0),
  unit_cost numeric(16,4) NOT NULL CHECK (unit_cost >= 0),
  currency_code varchar(3) NOT NULL CHECK (currency_code IN ('ILS', 'USD', 'EUR')),
  actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_purchase_order_line_terms_immutable
  BEFORE UPDATE OR DELETE ON purchase_order_line_terms
  FOR EACH ROW EXECUTE FUNCTION prevent_supplier_agreement_revision_change();

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_supplier_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_supplier_agreement_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_line_terms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON suppliers, project_supplier_agreements, project_supplier_agreement_revisions, purchase_order_line_terms FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON suppliers, project_supplier_agreements, project_supplier_agreement_revisions, purchase_order_line_terms FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON suppliers, project_supplier_agreements, project_supplier_agreement_revisions, purchase_order_line_terms FROM authenticated;
  END IF;
END $$;

COMMIT;
