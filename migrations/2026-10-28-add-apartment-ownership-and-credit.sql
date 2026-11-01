-- Purpose: preserve apartment ownership and optional ILS credit without altering existing records.
-- Date: 2026-10-28
-- Apply before deploying apartment import. Existing values remain NULL, not inferred or zero-filled.
-- Rollback requires exporting any populated values before removing these columns; do not discard data.
BEGIN;
CREATE TYPE enum_projects_apartment_ownership AS ENUM ('landowner', 'buyer');
ALTER TABLE projects
  ADD COLUMN apartment_ownership enum_projects_apartment_ownership,
  ADD COLUMN apartment_credit numeric,
  ADD CONSTRAINT chk_projects_apartment_ownership
    CHECK (apartment_ownership IS NULL OR apartment_ownership IN ('landowner', 'buyer')),
  ADD CONSTRAINT chk_projects_apartment_credit
    CHECK (apartment_credit IS NULL OR (apartment_credit >= 0 AND apartment_credit NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) AND scale(apartment_credit) <= 2)),
  ADD CONSTRAINT chk_projects_apartment_commercial_scope
    CHECK (parent_project_id IS NOT NULL OR (apartment_ownership IS NULL AND apartment_credit IS NULL));
COMMIT;
