# Quotation project links rollout

Apply `2026-11-09-quotation-project-links.sql` with the matching backend revision during a maintenance window. Stop all old backend replicas and background readers before applying it; they still reference `quotations.project_id`. Take a verified database backup first. Confirm that every quotation with a non-null `project_id` has one primary row in `quotation_projects` after the migration. The SQL aborts if that backfill count differs and is safe to rerun.

The new backend reads and writes `quotation_projects` only. Apartment links are secondary and never change the primary project, customer or quotation number. Deploy the frontend after the matching backend is healthy. No customer data or external integration is written by this migration.

## Rollback

Stop the new backend and take another backup. Restore the old column from primary links before starting an old backend revision:

```sql
BEGIN;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id);
UPDATE quotations AS quotation
SET project_id = link.project_id
FROM quotation_projects AS link
WHERE link.quotation_id = quotation.id AND link.is_primary;
CREATE INDEX IF NOT EXISTS idx_quotations_project ON quotations(project_id);
COMMIT;
```

Verify that every quotation with a primary link has the same `project_id` and that all historical quotations are still present. Keep `quotation_projects` and its apartment links during rollback: the old backend cannot display sharing, but deleting the association would lose it. If the old backend serves writes after rollback, reconcile any new or changed `project_id` values into `quotation_projects` before deploying the new backend again. Restore from the verified backup if the migration itself cannot complete.
