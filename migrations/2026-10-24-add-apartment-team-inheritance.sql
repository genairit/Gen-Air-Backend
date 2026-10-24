-- Purpose: link apartment customers and distinguish inherited teams from explicit overrides, including empty teams.
-- Date: 2026-10-24
-- Apply before deploying the apartment customer/team API. Legacy customer/contact columns are preserved.
-- Existing apartments with stored members retain their own team; apartments without stored members inherit.
-- Rollback: revert the API first; preserve linked customer data before reinstating the old apartment constraint.
-- Materialize inherited teams if required before dropping has_own_team.
BEGIN;

ALTER TABLE projects
  DROP CONSTRAINT chk_projects_apartment_has_no_customer,
  ADD COLUMN has_own_team boolean NOT NULL DEFAULT false;

UPDATE projects AS apartment
SET has_own_team = true
WHERE apartment.parent_project_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM project_members AS member WHERE member.project_id = apartment.id);

COMMIT;
