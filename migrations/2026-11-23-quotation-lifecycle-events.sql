-- Purpose: preserve immutable quotation lifecycle and approval evidence.
-- Starter generated with Supabase CLI 3.3.0: 20261123201728_quotation_lifecycle_events.sql.
CREATE TABLE public.quotation_lifecycle_events (
  id uuid PRIMARY KEY,
  quotation_id uuid NOT NULL REFERENCES public.quotations(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('submit','approve','return','reject','resubmit','cancel','restore')),
  from_status text NOT NULL CHECK (from_status IN ('draft','review','approved','cancelled')),
  to_status text NOT NULL CHECK (to_status IN ('draft','review','approved','cancelled')),
  actor_id uuid NOT NULL,
  actor_name text NOT NULL,
  occurred_at timestamptz NOT NULL,
  quotation_version integer NOT NULL CHECK (quotation_version > 0),
  reason text CHECK (reason IS NULL OR length(btrim(reason)) BETWEEN 1 AND 1000),
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  UNIQUE (quotation_id, quotation_version)
);
ALTER TABLE public.quotation_lifecycle_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quotation_lifecycle_events FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.reject_quotation_lifecycle_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'Quotation lifecycle history is immutable';
END;
$$;
REVOKE ALL ON FUNCTION public.reject_quotation_lifecycle_mutation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER quotation_lifecycle_events_immutable
BEFORE UPDATE OR DELETE OR TRUNCATE ON public.quotation_lifecycle_events
FOR EACH STATEMENT EXECUTE FUNCTION public.reject_quotation_lifecycle_mutation();
