-- Quotation aggregate and selectable catalogue. Apply schema before backend deployment.

BEGIN;

CREATE TABLE catalogue_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku varchar(200) NOT NULL,
  description varchar(1000) NOT NULL,
  unit varchar(40) NOT NULL,
  price numeric(16,4) NOT NULL,
  capacity_btu integer,
  brand varchar(100) NOT NULL,
  system_type varchar(10),
  equipment_role varchar(30) NOT NULL,
  equipment_types jsonb NOT NULL,
  status varchar(20) NOT NULL,
  preference varchar(20) NOT NULL,
  includes_remote boolean NOT NULL,
  includes_thermostat boolean NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  deleted_at timestamptz(3)
);

CREATE TABLE quotation_rules(key varchar(60) PRIMARY KEY, enabled boolean NOT NULL, version integer NOT NULL CHECK(version>0),parameters jsonb NOT NULL CHECK(jsonb_typeof(parameters)='object'),created_at timestamptz(3) NOT NULL DEFAULT now(),updated_at timestamptz(3) NOT NULL DEFAULT now());
ALTER TABLE quotation_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON quotation_rules FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON quotation_rules FROM anon; END IF; IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON quotation_rules FROM authenticated; END IF; END $$;
INSERT INTO quotation_rules(key,enabled,version,parameters) VALUES('vrf_headers',true,1,'{}');
INSERT INTO quotation_rules(key,enabled,version,parameters) VALUES('vrf_controls',true,1,'{}');
INSERT INTO quotation_rules(key,enabled,version,parameters) VALUES('piping',true,1,'{}');
INSERT INTO quotation_rules(key,enabled,version,parameters) VALUES('zero_price',true,1,'{}');
INSERT INTO quotation_rules(key,enabled,version,parameters) VALUES('capacity_distance',true,1,'{"maximumDeviation": 0.12}');
INSERT INTO quotation_rules(key,enabled,version,parameters) VALUES('less_useful',true,1,'{}');
INSERT INTO quotation_rules(key,enabled,version,parameters) VALUES('vrf_ratio',true,1,'{"minimumRatio": 1, "maximumRatio": 2}');
INSERT INTO quotation_rules(key,enabled,version,parameters) VALUES('missing_outdoor',true,1,'{}');
INSERT INTO quotation_rules(key,enabled,version,parameters) VALUES('missing_indoor',true,1,'{}');
INSERT INTO quotation_rules(key,enabled,version,parameters) VALUES('payment_terms',true,1,'{}');
INSERT INTO quotation_rules(key,enabled,version,parameters) VALUES('payment_schedule',true,1,'{}');

INSERT INTO quotation_rules(key,enabled,version,parameters) VALUES('do_not_sell',true,1,'{}');

CREATE TABLE quotations (
  rule_configuration jsonb NOT NULL,
  rule_config_fingerprint varchar(64) NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number varchar(40) NOT NULL,
  customer_id uuid NOT NULL,
  project_id uuid,
  status varchar(20) NOT NULL,
  date date NOT NULL,
  brand varchar(100) NOT NULL,
  payment_terms varchar(40),
  payment_terms_note varchar(1000) NOT NULL,
  payment_schedule jsonb NOT NULL,
  discount_percent numeric(7,4) NOT NULL,
  target_pretax_amount numeric(16,2),
  vat_rate numeric(7,4) NOT NULL,
  internal_notes varchar(5000) NOT NULL,
  version integer NOT NULL,
  acknowledged_warnings jsonb NOT NULL,
  created_by_id uuid NOT NULL,
  updated_by_id uuid NOT NULL,
  approved_by_id uuid,
  approved_at timestamptz(3),
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  deleted_at timestamptz(3)
);

CREATE TABLE quotation_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id uuid NOT NULL,
  title varchar(200) NOT NULL,
  system_type varchar(10) NOT NULL,
  display_order integer NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  deleted_at timestamptz(3)
);

CREATE TABLE quotation_items (
  catalogue_status varchar(20) NOT NULL,
  control_kind varchar(20),
  catalogue_preference varchar(20) NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL,
  catalogue_item_id uuid NOT NULL,
  parent_item_id uuid,
  sku varchar(200) NOT NULL,
  description varchar(1000) NOT NULL,
  unit varchar(40) NOT NULL,
  quoted_price numeric(16,4) NOT NULL,
  quantity numeric(12,4) NOT NULL,
  equipment_role varchar(30) NOT NULL,
  equipment_type varchar(100),
  capacity_btu integer,
  requested_capacity_btu integer,
  location varchar(200) NOT NULL,
  circuit varchar(1),
  display_order integer NOT NULL,
  includes_remote boolean NOT NULL,
  includes_thermostat boolean NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  deleted_at timestamptz(3)
);

CREATE TABLE catalogue_item_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  catalogue_item_id uuid NOT NULL,
  selection_count integer NOT NULL,
  last_selected_at timestamptz(3) NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  deleted_at timestamptz(3)
);

ALTER TABLE customers ADD COLUMN payment_terms varchar(40);

ALTER TABLE quotations
 ADD CONSTRAINT fk_quotation_customer FOREIGN KEY(customer_id) REFERENCES customers(id),
 ADD CONSTRAINT fk_quotation_project FOREIGN KEY(project_id) REFERENCES projects(id),
 ADD CONSTRAINT fk_quotation_creator FOREIGN KEY(created_by_id) REFERENCES users(id),
 ADD CONSTRAINT fk_quotation_updater FOREIGN KEY(updated_by_id) REFERENCES users(id),
 ADD CONSTRAINT fk_quotation_approver FOREIGN KEY(approved_by_id) REFERENCES users(id),
 ADD CONSTRAINT uq_quotation_number UNIQUE(number),
 ADD CONSTRAINT chk_quotation_status CHECK(status IN ('draft','review','approved')),
 ADD CONSTRAINT chk_quotation_version CHECK(version>0),
 ADD CONSTRAINT chk_quotation_discount CHECK(discount_percent>=0 AND discount_percent<=100),
 ADD CONSTRAINT chk_quotation_vat CHECK(vat_rate>=0 AND vat_rate<=100),
 ADD CONSTRAINT chk_quotation_target CHECK(target_pretax_amount>=0 AND target_pretax_amount<'Infinity'::numeric);

ALTER TABLE quotation_sections
 ADD CONSTRAINT fk_section_quotation FOREIGN KEY(quotation_id) REFERENCES quotations(id),
 ADD CONSTRAINT uq_section_order UNIQUE(quotation_id,display_order),
 ADD CONSTRAINT chk_section_type CHECK(system_type IN ('VRF','MULTI','SINGLE','GEN'));

ALTER TABLE quotation_items
 ADD CONSTRAINT fk_item_section FOREIGN KEY(section_id) REFERENCES quotation_sections(id),
 ADD CONSTRAINT fk_item_catalogue FOREIGN KEY(catalogue_item_id) REFERENCES catalogue_items(id),
 ADD CONSTRAINT fk_item_parent FOREIGN KEY(parent_item_id) REFERENCES quotation_items(id) DEFERRABLE INITIALLY DEFERRED,
 ADD CONSTRAINT uq_item_order UNIQUE(section_id,display_order),
 ADD CONSTRAINT chk_item_price CHECK(quoted_price>=0 AND quoted_price<'Infinity'::numeric),
 ADD CONSTRAINT chk_item_quantity CHECK(quantity>0 AND quantity<'Infinity'::numeric);

ALTER TABLE catalogue_items
 ADD CONSTRAINT chk_catalogue_status CHECK(status IN ('active','archived','nosell','conflict')),
 ADD CONSTRAINT chk_catalogue_price CHECK(price>=0 AND price<'Infinity'::numeric);
CREATE UNIQUE INDEX uq_catalogue_active_sku ON catalogue_items(sku) WHERE status='active' AND deleted_at IS NULL;
CREATE INDEX idx_catalogue_selection ON catalogue_items(status,brand,equipment_role,system_type);

ALTER TABLE catalogue_item_usage
 ADD CONSTRAINT fk_usage_user FOREIGN KEY(user_id) REFERENCES users(id),
 ADD CONSTRAINT fk_usage_item FOREIGN KEY(catalogue_item_id) REFERENCES catalogue_items(id),
 ADD CONSTRAINT uq_usage_user_item UNIQUE(user_id,catalogue_item_id),
 ADD CONSTRAINT chk_usage_count CHECK(selection_count>0);

CREATE INDEX idx_quotations_customer ON quotations(customer_id);
CREATE INDEX idx_quotations_project ON quotations(project_id);
CREATE INDEX idx_quotations_activity ON quotations(updated_at DESC,id DESC);
CREATE INDEX idx_quotation_items_catalogue ON quotation_items(catalogue_item_id);
CREATE INDEX idx_quotation_items_parent ON quotation_items(parent_item_id);
CREATE INDEX idx_catalogue_usage_item ON catalogue_item_usage(catalogue_item_id);

ALTER TABLE customers ADD CONSTRAINT chk_customer_payment_terms CHECK(payment_terms IN ('other','prepaid','milestones_net_60','installments_10_60_30','twelve_prepaid_checks'));

ALTER TABLE quotations ADD CONSTRAINT chk_quotation_payment_terms CHECK(payment_terms IN ('other','prepaid','milestones_net_60','installments_10_60_30','twelve_prepaid_checks'));

ALTER TABLE catalogue_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON catalogue_items FROM PUBLIC;

DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON catalogue_items FROM anon; END IF; IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON catalogue_items FROM authenticated; END IF; END $$;

ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON quotations FROM PUBLIC;

DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON quotations FROM anon; END IF; IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON quotations FROM authenticated; END IF; END $$;

ALTER TABLE quotation_sections ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON quotation_sections FROM PUBLIC;

DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON quotation_sections FROM anon; END IF; IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON quotation_sections FROM authenticated; END IF; END $$;

ALTER TABLE quotation_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON quotation_items FROM PUBLIC;

DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON quotation_items FROM anon; END IF; IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON quotation_items FROM authenticated; END IF; END $$;

ALTER TABLE catalogue_item_usage ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON catalogue_item_usage FROM PUBLIC;

DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON catalogue_item_usage FROM anon; END IF; IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON catalogue_item_usage FROM authenticated; END IF; END $$;

INSERT INTO permissions(key,feature,action) VALUES ('quotations.read','quotations','read'),('quotations.create','quotations','create'),('quotations.update','quotations','update'),('quotations.approve','quotations','approve'),('catalogue.manage','catalogue','manage');

INSERT INTO role_permissions(role,permission_key) SELECT role, 'quotations.read' FROM role_permissions WHERE permission_key='projects.read';

INSERT INTO role_permissions(role,permission_key) VALUES ('system_admin','quotations.create'),('system_admin','quotations.update'),('system_admin','quotations.approve'),('system_admin','catalogue.manage');

COMMIT;
