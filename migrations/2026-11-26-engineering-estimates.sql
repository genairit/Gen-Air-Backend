-- Persist engineering estimates, private source plans, and approved estimate revisions.
-- Supabase CLI 3.3.0 scaffold: 20261126113737_engineering_estimates.sql
BEGIN;

CREATE TABLE public.engineering_estimates (
  id uuid PRIMARY KEY,
  name varchar(250) NOT NULL CHECK (length(btrim(name)) > 0),
  created_by_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  project_id uuid REFERENCES public.projects(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  updated_at timestamptz NOT NULL,
  contents jsonb NOT NULL CHECK (jsonb_typeof(contents) = 'object')
);
CREATE INDEX engineering_estimates_creator_updated_idx
  ON public.engineering_estimates(created_by_id, updated_at DESC, id);
CREATE INDEX engineering_estimates_project_idx ON public.engineering_estimates(project_id);
CREATE INDEX engineering_estimates_updated_idx ON public.engineering_estimates(updated_at DESC, id);

CREATE TABLE public.engineering_estimate_plans (
  estimate_id uuid NOT NULL REFERENCES public.engineering_estimates(id) ON DELETE RESTRICT,
  id uuid NOT NULL,
  name varchar(255) NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('application/pdf', 'image/png', 'image/jpeg')),
  marked boolean NOT NULL,
  source_project_id uuid REFERENCES public.projects(id) ON DELETE RESTRICT,
  source_drive_file_id text,
  CHECK ((source_project_id IS NULL) = (source_drive_file_id IS NULL)),
  content bytea NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 4194304),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (estimate_id, id),
  CHECK (NOT marked OR (mime_type IN ('image/png', 'image/jpeg') AND octet_length(content) <= 524288))
);

CREATE INDEX engineering_estimate_plans_source_project_idx
  ON public.engineering_estimate_plans(source_project_id);

CREATE TABLE public.engineering_estimate_revisions (
  estimate_id uuid NOT NULL REFERENCES public.engineering_estimates(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  sketch_pdf bytea NOT NULL CHECK (octet_length(sketch_pdf) BETWEEN 1 AND 4194304),
  approved_at timestamptz,
  approved_by_id uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  quotation_id uuid UNIQUE REFERENCES public.quotations(id) ON DELETE RESTRICT,
  PRIMARY KEY (estimate_id, version),
  CHECK ((approved_at IS NULL) = (approved_by_id IS NULL)),
  CHECK (quotation_id IS NULL OR approved_at IS NOT NULL)
);
CREATE INDEX engineering_estimate_revisions_approver_idx
  ON public.engineering_estimate_revisions(approved_by_id);

CREATE FUNCTION public.guard_engineering_estimate_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Engineering estimate revisions are immutable';
  END IF;
  IF NEW.estimate_id IS DISTINCT FROM OLD.estimate_id
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.snapshot IS DISTINCT FROM OLD.snapshot
    OR NEW.sketch_pdf IS DISTINCT FROM OLD.sketch_pdf
    OR (OLD.approved_at IS NOT NULL AND
      (NEW.approved_at IS DISTINCT FROM OLD.approved_at OR NEW.approved_by_id IS DISTINCT FROM OLD.approved_by_id))
    OR (OLD.quotation_id IS NOT NULL AND NEW.quotation_id IS DISTINCT FROM OLD.quotation_id)
  THEN
    RAISE EXCEPTION 'Engineering estimate revisions are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER engineering_estimate_revision_immutable
  BEFORE UPDATE OR DELETE ON public.engineering_estimate_revisions
  FOR EACH ROW EXECUTE FUNCTION public.guard_engineering_estimate_revision();

ALTER TABLE public.engineering_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engineering_estimate_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engineering_estimate_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.engineering_estimates, public.engineering_estimate_plans,
  public.engineering_estimate_revisions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_engineering_estimate_revision() FROM PUBLIC, anon, authenticated;

INSERT INTO public.permissions(key) VALUES
  ('engineering_estimates.read'),
  ('engineering_estimates.manage'),
  ('engineering_estimates.approve')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions(role,permission_key) VALUES
  ('engineer','engineering_estimates.read'),
  ('engineer','engineering_estimates.manage'),
  ('engineering_lead','engineering_estimates.read'),
  ('engineering_lead','engineering_estimates.manage'),
  ('engineering_lead','engineering_estimates.approve'),
  ('system_admin','engineering_estimates.read'),
  ('system_admin','engineering_estimates.manage'),
  ('system_admin','engineering_estimates.approve')
ON CONFLICT DO NOTHING;

COMMIT;
