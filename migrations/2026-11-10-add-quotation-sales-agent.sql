-- Purpose: retain an optional sales-agent assignment on each quotation.
-- Date: 2026-11-10

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'sales_agent';

-- The role has no automatic feature grants; assignment does not grant editing or approval.
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS sales_agent_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_quotations_sales_agent'
      AND conrelid = 'quotations'::regclass
  ) THEN
    ALTER TABLE quotations
      ADD CONSTRAINT fk_quotations_sales_agent
      FOREIGN KEY (sales_agent_id)
      REFERENCES users (id)
      ON DELETE RESTRICT;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_quotations_sales_agent_id
  ON quotations (sales_agent_id);
