BEGIN;
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS payment_schedule jsonb NOT NULL DEFAULT '[]'::jsonb;
COMMIT;
