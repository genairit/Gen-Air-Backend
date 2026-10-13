-- Purpose: add the customers table (לקוחות), the owners of projects and buildings, kept in sync with Priority.
-- Date: 2026-10-13
-- Fields follow design-customer-screens: identity (name, ח.פ / ת.פ / ת.ז / מ״ע, address) and one main contact (name, phone, email).
-- customer_type reuses project_detail_field_set so a customer and a project type share one definition of company, private client and institution.
-- Saving goes to Priority first, then the CRM. A customer saved after a failed sync stays in the CRM with priority_sync_status = 'failed' and no priority_id.
-- Apartment end customers are not customers rows; they stay inline on the apartment project.

CREATE TYPE priority_sync_status AS ENUM ('pending', 'synced', 'failed');

CREATE SEQUENCE customer_number_seq START 1001;

CREATE TABLE customers (
  id                     UUID                     PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_number        VARCHAR(16)              NOT NULL UNIQUE DEFAULT ('CU-' || nextval('customer_number_seq')),
  customer_type          project_detail_field_set NOT NULL,
  name                   VARCHAR(200)             NOT NULL,
  tax_id                 VARCHAR(9)               NOT NULL CHECK (tax_id ~ '^[0-9]{9}$'),
  address                VARCHAR(200)             NOT NULL,
  contact_name           VARCHAR(120)             NOT NULL,
  phone                  VARCHAR(20)              NOT NULL,
  email                  CITEXT                   NOT NULL,
  priority_id            VARCHAR(64),
  priority_sync_status   priority_sync_status     NOT NULL DEFAULT 'pending',
  priority_synced_at     TIMESTAMPTZ(3),
  priority_sync_attempts INTEGER                  NOT NULL DEFAULT 0 CHECK (priority_sync_attempts >= 0),
  priority_sync_error    VARCHAR(500),
  created_by_id          UUID                     NOT NULL REFERENCES users (id),
  created_at             TIMESTAMPTZ(3)           NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ(3)           NOT NULL DEFAULT NOW(),
  deleted_at             TIMESTAMPTZ(3),
  CONSTRAINT chk_customers_synced_has_priority_id
    CHECK (priority_sync_status <> 'synced' OR (priority_id IS NOT NULL AND priority_synced_at IS NOT NULL))
);

CREATE UNIQUE INDEX uq_customers_tax_id ON customers (tax_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_customers_priority_id ON customers (priority_id) WHERE priority_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_customers_priority_sync_status ON customers (priority_sync_status) WHERE deleted_at IS NULL;
CREATE INDEX idx_customers_name ON customers (name) WHERE deleted_at IS NULL;
CREATE INDEX idx_customers_created_by_id ON customers (created_by_id);
