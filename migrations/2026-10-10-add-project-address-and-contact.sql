-- Purpose: add the Google-verified project address and the project contact person to projects.
-- Date: 2026-10-10
-- The address comes from Google Places (spike-google-maps-address-validation): address holds the formatted address,
-- address_place_id the Places id, and address_city the locality component, kept separately because private and luxury projects need it.
-- address_verified_at marks an address resolved from a picked Places suggestion; NULL means an unverified, free-typed address.
-- address_place_id is TEXT because Google documents no maximum length for place ids.
-- Every column stays nullable: existing projects predate the requirement, so NOT NULL would fail on them.
-- "Every new project has a verified address and a contact person" is enforced in the project module, not here.
-- The CHECKs only keep each row coherent: a verified address carries its place id, text and coordinates, and coordinates are in range.

ALTER TABLE projects
  ADD COLUMN address             VARCHAR(255),
  ADD COLUMN address_place_id    TEXT,
  ADD COLUMN address_city        VARCHAR(80),
  ADD COLUMN address_latitude    DOUBLE PRECISION CHECK (address_latitude BETWEEN -90 AND 90),
  ADD COLUMN address_longitude   DOUBLE PRECISION CHECK (address_longitude BETWEEN -180 AND 180),
  ADD COLUMN address_verified_at TIMESTAMPTZ(3),
  ADD COLUMN contact_name        VARCHAR(120),
  ADD COLUMN contact_phone       VARCHAR(20),
  ADD COLUMN contact_role        VARCHAR(60),
  ADD CONSTRAINT chk_projects_address_coordinates_paired
    CHECK ((address_latitude IS NULL) = (address_longitude IS NULL)),
  ADD CONSTRAINT chk_projects_verified_address_complete
    CHECK (
      address_verified_at IS NULL
      OR (address IS NOT NULL AND address_place_id IS NOT NULL AND address_latitude IS NOT NULL)
    );
