-- Purpose: introduce customer-owned contacts without importing old contact records.
-- Date: 2026-10-28
-- Apply before the contact API. Contacts start empty and are created through the API or apartment import.
BEGIN;

CREATE TABLE customer_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id),
  name VARCHAR(200) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(254),
  role VARCHAR(60),
  created_by_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ(3)
);

CREATE INDEX idx_customer_contacts_customer_id ON customer_contacts(customer_id);
CREATE INDEX idx_customer_contacts_created_by_id ON customer_contacts(created_by_id);
CREATE UNIQUE INDEX uq_customer_contacts_active_tuple ON customer_contacts
  (customer_id, name, COALESCE(phone, ''), COALESCE(email, ''), COALESCE(role, ''))
  WHERE deleted_at IS NULL;

ALTER TABLE customer_contacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON customer_contacts FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON customer_contacts FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON customer_contacts FROM authenticated;
  END IF;
END $$;

COMMIT;
