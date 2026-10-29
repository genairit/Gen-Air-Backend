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

COMMIT;
