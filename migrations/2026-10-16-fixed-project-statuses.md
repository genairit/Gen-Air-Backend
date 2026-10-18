# Replace dynamic project stages with fixed work statuses

Apply `2026-10-16-fixed-project-statuses.sql` before deploying the backend and
frontend companion PRs. No new environment variables are required.

The user confirmed these replace the global sales stages, in this exact order:

1. ממתין
2. בעבודה
3. להמתין
4. הסתיים

The catalog has stable database UUIDs and is read-only. The database rejects all
catalog writes, including reordering and truncation; the API exposes only
`GET /project-stage`. Retired create/update/delete/reorder endpoints return 404.
Authorized project status changes keep using `PATCH /project/:id/stage`. The
service and a database trigger reject retired status IDs. New projects default
to ממתין. A missing or modified fixed catalog returns an actionable 503 rather
than silently exposing the old definitions.

## Data migration

**Every existing project resets to ממתין**, including buildings, apartments and
soft-deleted rows. This is the user's explicit migration choice, not a positional
mapping of sales stages to work statuses. The SQL locks the catalog and projects
for the duration of its transaction. Stop application writes and take a database
backup before running it, allowing time for the full-project update on large DBs.

Old definitions are soft-deleted and retained with their original IDs/names.
Existing `project_stage_transitions` rows are not rewritten or deleted. The
history reader already includes soft-deleted definitions, so old labels remain
visible. The reset is a migration, not a user action; it does not fabricate an
employee actor or append user-generated transition records.

`project_stage_reset_snapshots` preserves each pre-existing project's original
stage ID and update timestamp, plus the migration timestamp, for recovery/audit.
The catalog trigger is the completion marker. Reapplying the script retains
subsequent status changes and does not add snapshots for later projects.

The migration has only been tested against a disposable local database; it has
not been applied to the shared dev or company database as part of this change.

## Recovery

A full pre-migration database backup is the authoritative rollback. Do not drop
historical definitions or snapshots after deploying. If restoring individual
assignments, stop writes, revert the application first and disable/drop the new
catalog and assignment triggers under maintenance access. Restore only projects
whose current assignment/update timestamp still matches the migration state;
review projects edited after migration individually. Reactivate only the catalog
rows archived by this migration, remove the fixed default/catalog, and verify
foreign keys, counts, history and default creation behavior before reopening the
application. Avoid overwriting later user status changes with a blanket rollback.

## Reproducible verification

On a disposable PostgreSQL 17 database, apply the SQL migrations preceding this
one in filename order, then run:

```sh
psql -v ON_ERROR_STOP=1 -f test/migrations/fixed-project-statuses.sql
```

The test creates fixtures and applies this migration itself. It verifies exact
names/order, reset and snapshots (including a deleted apartment), old history
labels, default creation, idempotence after a later status change, and database
rejection of catalog writes/truncation and retired assignment targets. Never run
this fixture script on an existing development or company database.
