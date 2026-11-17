BEGIN;

CREATE TABLE purchase_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  status varchar(20) NOT NULL CHECK (status IN ('draft', 'requested', 'reviewed', 'approved', 'ordered', 'cancelled')),
  supplier_name varchar(120),
  order_date date,
  on_behalf_of varchar(200),
  exception_reason varchar(1000),
  notes varchar(1000) NOT NULL DEFAULT '',
  material_search text NOT NULL DEFAULT '',
  created_by_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL,
  payload_hash varchar(64) NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT uq_purchase_records_command UNIQUE (project_id, created_by_id, idempotency_key),
  CONSTRAINT chk_purchase_records_order_details CHECK (status <> 'ordered' OR (supplier_name IS NOT NULL AND order_date IS NOT NULL))
);

CREATE TABLE purchase_record_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES purchase_records(id) ON DELETE RESTRICT,
  boq_line_id uuid NOT NULL,
  boq_source_key varchar(200) NOT NULL,
  material_id uuid NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  material_name varchar(200) NOT NULL,
  material_unit varchar(12) NOT NULL,
  quantity numeric(16,8) NOT NULL CHECK (quantity > 0 AND quantity < 'Infinity'::numeric),
  unit_cost numeric(16,4) CHECK (unit_cost IS NULL OR (unit_cost >= 0 AND unit_cost < 'Infinity'::numeric)),
  currency_code varchar(3) NOT NULL DEFAULT 'ILS',
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT uq_purchase_record_line_source UNIQUE (record_id, boq_source_key)
);

CREATE TABLE purchase_record_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES purchase_records(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL,
  payload_hash varchar(64) NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action varchar(20) NOT NULL CHECK (action IN ('create', 'transition', 'correct')),
  previous_status varchar(20),
  next_status varchar(20) NOT NULL,
  reason varchar(1000) NOT NULL DEFAULT '',
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT uq_purchase_record_event_command UNIQUE (record_id, idempotency_key)
);

CREATE TABLE purchase_record_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_line_id uuid NOT NULL REFERENCES purchase_record_lines(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL,
  quantity numeric(16,8) NOT NULL CHECK (quantity > 0 AND quantity < 'Infinity'::numeric),
  actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason varchar(1000) NOT NULL CHECK (length(trim(reason)) > 0),
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT uq_purchase_record_correction_command UNIQUE (record_line_id, idempotency_key)
);

CREATE OR REPLACE FUNCTION prevent_purchase_ledger_history_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'purchase ledger history is immutable';
END;
$$;
CREATE TRIGGER trg_purchase_record_lines_immutable BEFORE UPDATE OR DELETE ON purchase_record_lines FOR EACH ROW EXECUTE FUNCTION prevent_purchase_ledger_history_change();
CREATE TRIGGER trg_purchase_record_events_immutable BEFORE UPDATE OR DELETE ON purchase_record_events FOR EACH ROW EXECUTE FUNCTION prevent_purchase_ledger_history_change();
CREATE TRIGGER trg_purchase_record_corrections_immutable BEFORE UPDATE OR DELETE ON purchase_record_corrections FOR EACH ROW EXECUTE FUNCTION prevent_purchase_ledger_history_change();

CREATE INDEX idx_purchase_records_project_created ON purchase_records (project_id, created_at DESC);
CREATE INDEX idx_purchase_record_lines_source ON purchase_record_lines (boq_source_key);
CREATE INDEX idx_purchase_record_lines_record ON purchase_record_lines (record_id);
CREATE INDEX idx_purchase_record_events_record_created ON purchase_record_events (record_id, created_at);
CREATE INDEX idx_purchase_record_corrections_line ON purchase_record_corrections (record_line_id);

ALTER TABLE purchase_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_record_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_record_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_record_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON purchase_records, purchase_record_lines, purchase_record_events, purchase_record_corrections FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON purchase_records, purchase_record_lines, purchase_record_events, purchase_record_corrections FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON purchase_records, purchase_record_lines, purchase_record_events, purchase_record_corrections FROM authenticated;
  END IF;
END $$;

COMMIT;
