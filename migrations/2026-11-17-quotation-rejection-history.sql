BEGIN;

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS rejection_history jsonb NOT NULL DEFAULT '[]'::jsonb;

INSERT INTO role_permissions (role, permission_key)
VALUES
  ('engineer', 'quotations.update'),
  ('engineering_lead', 'quotations.update')
ON CONFLICT (role, permission_key) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_quotations_rejection_history_array'
      AND conrelid = 'quotations'::regclass
  ) THEN
    ALTER TABLE quotations
      ADD CONSTRAINT chk_quotations_rejection_history_array
      CHECK (jsonb_typeof(rejection_history) = 'array');
  END IF;
END
$$;

COMMIT;
