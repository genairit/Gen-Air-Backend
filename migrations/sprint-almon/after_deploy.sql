-- Run after deploying removal of project/apartment payment-term reads and writes.
-- Approved nonproduction values are discarded, never copied to customers or quotations.
BEGIN;

-- Destructive: uncomment only after confirming the deployed revision no longer uses these fields.
-- ALTER TABLE projects
--   DROP CONSTRAINT IF EXISTS chk_projects_payment_terms_note_only_for_other,
--   DROP COLUMN IF EXISTS payment_terms_note,
--   DROP COLUMN IF EXISTS payment_terms;

-- Destructive: uncomment after the project columns are removed; never use CASCADE.
-- DROP TYPE IF EXISTS payment_terms;

SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = current_schema()
  AND table_name IN ('projects', 'customers', 'quotations')
  AND column_name IN ('payment_terms', 'payment_terms_note')
ORDER BY table_name, column_name;

-- Expect customers.payment_terms and both quotation fields, and no project fields.
-- Review the results before committing. Use ROLLBACK; to abort.
-- COMMIT;
