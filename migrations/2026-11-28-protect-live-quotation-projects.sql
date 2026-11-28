-- Keep each live quotation reachable from its primary project after a project edit.
BEGIN;
CREATE OR REPLACE FUNCTION protect_live_quotation_project() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.quotation_projects l JOIN public.quotations q ON q.id = l.quotation_id
    WHERE l.project_id = OLD.id AND l.is_primary AND q.deleted_at IS NULL
      AND (NEW.deleted_at IS NOT NULL OR NEW.customer_id IS DISTINCT FROM q.customer_id)
  ) THEN
    RAISE EXCEPTION 'Project has live primary quotations'
      USING ERRCODE = '23514', CONSTRAINT = 'live_quotation_project_context';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION protect_live_quotation_project() FROM PUBLIC;
CREATE OR REPLACE TRIGGER protect_live_quotation_project
BEFORE UPDATE OF customer_id, deleted_at ON projects FOR EACH ROW
WHEN ((OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
   OR (NEW.deleted_at IS NULL AND OLD.customer_id IS DISTINCT FROM NEW.customer_id))
EXECUTE FUNCTION protect_live_quotation_project();
COMMIT;
