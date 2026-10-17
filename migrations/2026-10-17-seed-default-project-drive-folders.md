# Default project Drive folders

Date: 2026-10-17

Apply `2026-10-17-seed-default-project-drive-folders.sql` to the app database after
`2026-10-07-add-crm-mvp-schema.sql`. This is a data-only migration; the schema and
ERD do not change. It does not require the fixed-project-status migration.

The migration adds the 12 root folders from the supplied project folder reference
into `drive_template_folders`. The SQL values are the canonical names and reference
order. On an empty template they occupy positions 1–12. On an existing template,
exact root-name matches are reused unchanged and missing folders are appended in
reference order after the last root position. Custom folders, children, IDs,
positions and timestamps are preserved. A similarly named nested folder does not
replace a required root folder. Reapplying the migration inserts nothing once all
names exist; it does not update existing rows or collapse existing duplicates.

Take a database backup and pause project creation/template edits while applying
this short transaction. It locks template writes until commit. Review the template:

```sql
SELECT id, parent_id, name, position
FROM drive_template_folders
ORDER BY parent_id NULLS FIRST, position;
```

The existing project-created event handler reads this template and provisions its
folders below the new project's Drive folder. Google Drive credentials and
`GOOGLE_DRIVE_ROOT_FOLDER_ID` must be configured. Provisioning failure is logged and
can be retried through `POST /project-drive/:projectId/provision` with the existing
authorized account. Confirm the template read endpoint (`GET /drive-template-folder`)
and create a test project in the intended environment to verify live Drive access.

This migration makes no Google API calls and never modifies existing project folders
or files. It does not change project statuses. Explicitly provisioning an old project
later will use the current template, as it does today.

For recovery, restore only the template rows from the pre-migration backup while
creation/edits are paused. Do not delete folders by name as a rollback: matching
folders may have existed before the migration or acquired custom children since.
Rolling back the template does not remove any real Drive folders already created.

Regression check (a **disposable database only**, after the initial schema migration):

```sh
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f test/migrations/default-project-drive-folders.sql
```

The fixture clears only the disposable template table and covers an empty template,
existing/custom/nested folders, identity preservation, positions and repeat runs.
