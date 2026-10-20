-- Purpose: align user roles with the product role spec — add engineer and
-- finance, rename lead_installer to installer, and drop project slots held by
-- system admins (management sees every project, so the slot grants nothing).
-- Date: 2026-10-19
-- Apply after 2026-10-07-add-crm-mvp-schema.sql. The renamed value keeps every
-- existing users, project_members and project_stage_transitions row valid.
-- Rollback: ALTER TYPE user_role RENAME VALUE 'installer' TO 'lead_installer';
-- PostgreSQL cannot drop enum values, so engineer/finance stay once added.

BEGIN;

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'engineer';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'finance';
ALTER TYPE user_role RENAME VALUE 'lead_installer' TO 'installer';

DELETE FROM project_members WHERE role = 'system_admin';

COMMIT;
