-- Remove values that can be recovered without storing a second copy.
-- Apply during a maintenance window after stopping every old backend replica.
-- Start only the matching backend revision after this transaction commits.
BEGIN;

-- Existing keys are already checked against feature || '.' || action.
ALTER TABLE permissions DROP CONSTRAINT chk_permissions_key;
ALTER TABLE permissions DROP CONSTRAINT uq_permissions_feature_action;
ALTER TABLE permissions
  ADD CONSTRAINT chk_permissions_key_format
  CHECK (key ~ '^[^.]+\..+$');
ALTER TABLE permissions DROP COLUMN feature, DROP COLUMN action;

-- The application derives the fingerprint from immutable stored rule settings.
ALTER TABLE quotations DROP COLUMN rule_config_fingerprint;

-- These two histories are append-only, so created_at is their only timestamp.
ALTER TABLE project_stage_transitions DROP COLUMN updated_at;
ALTER TABLE questionnaire_submissions DROP COLUMN updated_at;

COMMIT;
