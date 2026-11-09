-- Purpose: preserve customer and site contacts while allowing an optional customer primary
-- and independently reusable contacts on projects and apartments.
-- Date: 2026-11-09
-- Apply before deploying the matching backend. Roll back by restoring a database snapshot;
-- dropping these links or restoring NOT NULL would discard newly valid contact-free customers.

ALTER TABLE customers
  ALTER COLUMN contact_name DROP NOT NULL,
  ALTER COLUMN phone DROP NOT NULL,
  ALTER COLUMN email DROP NOT NULL;

ALTER TABLE customer_contacts ALTER COLUMN customer_id DROP NOT NULL;

ALTER TABLE customers ADD COLUMN primary_contact_id uuid
  REFERENCES customer_contacts(id) ON DELETE RESTRICT;

-- Match the customer's stored tuple explicitly. Never infer primary from row order.
DO $$
DECLARE owner customers%ROWTYPE;
DECLARE chosen_contact_id uuid;
BEGIN
  FOR owner IN SELECT * FROM customers WHERE contact_name IS NOT NULL LOOP
    SELECT id INTO chosen_contact_id
    FROM customer_contacts
    WHERE customer_id = owner.id
      AND deleted_at IS NULL
      AND name = owner.contact_name
      AND phone IS NOT DISTINCT FROM owner.phone
      AND email IS NOT DISTINCT FROM owner.email
    ORDER BY (role IS NOT NULL), created_at, id
    LIMIT 1;

    IF chosen_contact_id IS NULL THEN
      INSERT INTO customer_contacts (id, customer_id, name, phone, email, role,
        created_by_id, created_at, updated_at)
      VALUES (gen_random_uuid(), owner.id, owner.contact_name, owner.phone,
        owner.email, NULL, owner.created_by_id, now(), now())
      RETURNING id INTO chosen_contact_id;
    END IF;

    UPDATE customers SET primary_contact_id = chosen_contact_id WHERE id = owner.id;
  END LOOP;
END $$;

CREATE TABLE project_contact_links (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES customer_contacts(id) ON DELETE RESTRICT,
  role varchar(60),
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, contact_id)
);

CREATE UNIQUE INDEX uq_project_contact_primary
  ON project_contact_links(project_id) WHERE is_primary;
CREATE INDEX idx_project_contact_links_contact_id
  ON project_contact_links(contact_id);

-- Each existing inline project/apartment contact receives a directory ID and primary link.
-- Separate rows avoid merging people merely because legacy names or numbers coincide.
CREATE TEMP TABLE migrated_project_contacts AS
SELECT id AS project_id, gen_random_uuid() AS contact_id
FROM projects WHERE contact_name IS NOT NULL AND btrim(contact_name) <> '';

INSERT INTO customer_contacts (id, customer_id, name, phone, email, role,
  created_by_id, created_at, updated_at)
SELECT m.contact_id, NULL, p.contact_name, p.contact_phone, NULL,
  p.contact_role, p.created_by_id, now(), now()
FROM migrated_project_contacts m JOIN projects p ON p.id = m.project_id;

INSERT INTO project_contact_links(project_id, contact_id, role, is_primary)
SELECT m.project_id, m.contact_id, p.contact_role, true
FROM migrated_project_contacts m JOIN projects p ON p.id = m.project_id;

DROP TABLE migrated_project_contacts;

ALTER TABLE customer_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_contact_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON project_contact_links FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON project_contact_links FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON project_contact_links FROM authenticated;
  END IF;
END $$;
