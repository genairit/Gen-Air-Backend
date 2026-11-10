BEGIN;

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS cancelled_from_status varchar(20),
  ADD COLUMN IF NOT EXISTS cancellation_history jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE quotations
  DROP CONSTRAINT IF EXISTS chk_quotation_status;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_quotations_status'
      AND conrelid = 'quotations'::regclass
  ) THEN
    ALTER TABLE quotations
      ADD CONSTRAINT chk_quotations_status
      CHECK (status IN ('draft', 'review', 'approved', 'cancelled'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_quotations_cancelled_from_status'
      AND conrelid = 'quotations'::regclass
  ) THEN
    ALTER TABLE quotations
      ADD CONSTRAINT chk_quotations_cancelled_from_status
      CHECK (
        (
          status = 'cancelled'
          AND cancelled_from_status IS NOT NULL
          AND cancelled_from_status IN ('draft', 'review', 'approved')
        )
        OR
        (status <> 'cancelled' AND cancelled_from_status IS NULL)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_quotations_cancellation_history_array'
      AND conrelid = 'quotations'::regclass
  ) THEN
    ALTER TABLE quotations
      ADD CONSTRAINT chk_quotations_cancellation_history_array
      CHECK (jsonb_typeof(cancellation_history) = 'array');
  END IF;
END
$$;

COMMIT;
