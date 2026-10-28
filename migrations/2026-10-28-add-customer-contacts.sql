-- Purpose: introduce customer-owned contacts without choosing a main contact or deleting legacy data.
-- Date: 2026-10-28
-- Apply before the contact API. Do not remove project/customer legacy fields during this rollout.
-- The documented customer main-contact tuple is copied verbatim; project ownership remains unresolved.
-- Rollback: revert the API first, retain/export this table and all added contacts; no destructive rollback is supplied.
BEGIN;

CREATE TABLE customer_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id),
  name VARCHAR(200) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(254),
  role VARCHAR(60),
  created_by_id UUID NOT NULL REFERENCES users(id),
  legacy_source_customer_id UUID REFERENCES customers(id),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ(3),
  CONSTRAINT uq_customer_contacts_legacy_source UNIQUE (legacy_source_customer_id)
);

CREATE INDEX idx_customer_contacts_customer_id ON customer_contacts(customer_id);
CREATE INDEX idx_customer_contacts_created_by_id ON customer_contacts(created_by_id);
CREATE UNIQUE INDEX uq_customer_contacts_active_tuple ON customer_contacts
  (customer_id, name, COALESCE(phone, ''), COALESCE(email, ''), COALESCE(role, ''))
  WHERE deleted_at IS NULL;

INSERT INTO customer_contacts (
  customer_id, name, phone, email, role, created_by_id,
  legacy_source_customer_id, created_at, updated_at, deleted_at
)
SELECT id, contact_name, phone, email, NULL, created_by_id,
       id, created_at, updated_at, deleted_at
FROM customers;

COMMIT;

-- Review these unresolved project source records before any later ownership migration or field retirement.
SELECT id AS source_project_id, customer_id, customer_name, customer_phone, customer_email,
       contact_name, contact_phone, contact_role, deleted_at
FROM projects
WHERE customer_name IS NOT NULL OR customer_phone IS NOT NULL OR customer_email IS NOT NULL
   OR contact_name IS NOT NULL OR contact_phone IS NOT NULL OR contact_role IS NOT NULL;
