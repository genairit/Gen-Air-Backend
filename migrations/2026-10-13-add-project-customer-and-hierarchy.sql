-- Purpose: link projects to customers, and nest apartments one level under a בנייה רוויה building.
-- Date: 2026-10-13
-- customer_id links a building or a standalone project to its customer. An apartment's end customer stays inline (customer_name / customer_phone), so apartments never carry a customer_id.
-- Existing projects are not backfilled into customers: their inline details lack the tax ID, contact and email that a customers row requires, so customer_id starts null and is set from the project form.
-- Which project types may hold apartments is data on project_types, like detail_field_set, so no code depends on a type's name.
-- The trigger keeps nesting to one level; whether the parent's type allows apartments is checked in the project module, because a constraint on projects cannot read project_types.

ALTER TABLE project_types ADD COLUMN can_have_apartments BOOLEAN NOT NULL DEFAULT false;

UPDATE project_types SET can_have_apartments = true, updated_at = NOW() WHERE name = 'בנייה רוויה';

ALTER TABLE projects
  ADD COLUMN customer_id       UUID REFERENCES customers (id),
  ADD COLUMN parent_project_id UUID REFERENCES projects (id),
  ALTER COLUMN code TYPE VARCHAR(12),
  DROP CONSTRAINT projects_code_check,
  ADD CONSTRAINT projects_code_check CHECK (code ~ '^[^-]{2}-[0-9]{5}(-[0-9]{2,3})?$'),
  ADD CONSTRAINT chk_projects_apartment_has_no_customer
    CHECK (parent_project_id IS NULL OR customer_id IS NULL),
  ADD CONSTRAINT chk_projects_apartment_has_floor_and_number
    CHECK (parent_project_id IS NULL OR (customer_floor IS NOT NULL AND customer_apartment IS NOT NULL));

CREATE INDEX idx_projects_customer_id ON projects (customer_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_parent_project_id ON projects (parent_project_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_projects_parent_apartment ON projects (parent_project_id, customer_apartment)
  WHERE parent_project_id IS NOT NULL AND deleted_at IS NULL;

CREATE FUNCTION enforce_single_level_project_nesting() RETURNS trigger AS $$
BEGIN
  IF NEW.parent_project_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_project_id = NEW.id THEN
    RAISE EXCEPTION 'A project cannot be nested under itself' USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (SELECT 1 FROM projects WHERE id = NEW.parent_project_id AND parent_project_id IS NOT NULL) THEN
    RAISE EXCEPTION 'An apartment cannot hold apartments' USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (SELECT 1 FROM projects WHERE parent_project_id = NEW.id) THEN
    RAISE EXCEPTION 'A building with apartments cannot be nested' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_projects_single_level_nesting
  BEFORE INSERT OR UPDATE OF parent_project_id ON projects
  FOR EACH ROW EXECUTE FUNCTION enforce_single_level_project_nesting();
