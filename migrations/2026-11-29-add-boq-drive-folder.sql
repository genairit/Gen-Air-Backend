-- Purpose: add the "כתבי כמויות" project Drive folder and bind it to the `boq` publication role
-- so exported bills of quantities are saved there.
-- Date: 2026-11-29
BEGIN;

LOCK TABLE drive_template_folders IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE quotation_publication_roles
  DROP CONSTRAINT IF EXISTS quotation_publication_roles_role_check;
ALTER TABLE quotation_publication_roles
  ADD CONSTRAINT quotation_publication_roles_role_check
  CHECK (role IN ('quotation', 'order', 'archive', 'boq'));

DO $$
DECLARE
  matches integer;
  candidate uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM quotation_publication_roles WHERE role = 'boq') THEN
    RETURN;
  END IF;

  SELECT count(*), min(id::text)::uuid INTO matches, candidate
  FROM drive_template_folders
  WHERE parent_id IS NULL AND name = 'כתבי כמויות';
  IF matches > 1 THEN
    RAISE EXCEPTION 'Ambiguous BOQ Drive template folder';
  END IF;

  IF matches = 0 THEN
    INSERT INTO drive_template_folders (id, parent_id, name, position, created_at, updated_at)
    SELECT gen_random_uuid(), NULL, 'כתבי כמויות', COALESCE(max(position), 0) + 1, now(), now()
    FROM drive_template_folders
    WHERE parent_id IS NULL
    RETURNING id INTO candidate;
  END IF;

  INSERT INTO quotation_publication_roles (role, template_id) VALUES ('boq', candidate);
END $$;

COMMIT;
