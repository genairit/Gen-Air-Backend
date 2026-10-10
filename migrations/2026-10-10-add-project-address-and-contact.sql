-- Purpose: add the Google-verified project address and the project contact person to projects.
-- Date: 2026-10-10
-- The address comes from Google Places (spike-google-maps-address-validation): address holds the formatted address,
-- address_place_id the Places id, and address_city the locality component, kept separately because private and luxury projects need it.
-- A place id is the verification marker: the design only accepts an address picked from Places suggestions, so free text is never stored.
-- Coordinates are not stored: nothing uses them yet, Google's terms limit how long they may be cached, and the place id can fetch them on demand.
-- address_place_id is TEXT because Google documents no maximum length for place ids.
-- Every column stays nullable: existing projects predate the requirement, so NOT NULL would fail on them.
-- "Every new project has a verified address and a contact person" is enforced in the project module, not here.

ALTER TABLE projects
  ADD COLUMN address          VARCHAR(255),
  ADD COLUMN address_place_id TEXT,
  ADD COLUMN address_city     VARCHAR(80),
  ADD COLUMN contact_name     VARCHAR(120),
  ADD COLUMN contact_phone    VARCHAR(20),
  ADD COLUMN contact_role     VARCHAR(60),
  ADD CONSTRAINT chk_projects_address_has_place_id
    CHECK ((address IS NULL) = (address_place_id IS NULL));
