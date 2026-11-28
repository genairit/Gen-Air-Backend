-- Run with psql -v ON_ERROR_STOP=1. A nonzero exit blocks retirement of the old list.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
DO $$
DECLARE
  missing_count bigint;
BEGIN
  SELECT COUNT(*) INTO missing_count FROM quotations q
  WHERE q.deleted_at IS NULL AND NOT EXISTS (
    SELECT 1 FROM quotation_projects link JOIN projects p ON p.id = link.project_id
    WHERE link.quotation_id = q.id AND link.is_primary AND p.deleted_at IS NULL AND p.customer_id = q.customer_id
  );
  IF missing_count <> 0 THEN
    RAISE EXCEPTION '% live quotations are missing an active primary project for their customer', missing_count;
  END IF;
END $$;
COMMIT;
