# Project Priority field rename

`projects.erp_reference` becomes `priority_id` (`VARCHAR(64)`, nullable).
`projects.erp_synced_at` becomes `priority_synced_at` (`TIMESTAMPTZ(3)`, nullable).
The API properties become `priorityId` and `prioritySyncedAt`, matching customers.
Existing IDs and timestamps are renamed in place; no integration behavior changes.

## Existing environments

Roll out development, test, then production, checking the target database each time:

1. Record row counts and existing ID/timestamp values before applying changes.
2. Apply `2026-10-19-01-rename-project-erp-fields-to-priority.sql` as one transaction.
   Its generated legacy columns let the previous backend continue reading projects
   while Railway builds the new backend. The previous app does not write these fields.
3. Deploy the backend containing the new model. Verify the deployment revision,
   project list/detail responses, and the `priorityId`/`prioritySyncedAt` contract.
4. Deploy the matching frontend and verify the project sync caption. An older frontend
   still renders projects but cannot display a populated sync date from the renamed API.
5. Once all old backend instances have stopped, apply
   `2026-10-19-02-remove-project-erp-read-aliases.sql`. Only generated aliases are
   removed; the renamed original columns retain their values.
6. Verify the new column types/nullability, absence of legacy columns, unchanged
   values/counts, and healthy project API responses. Never reset an existing database.

Fresh disposable databases can apply both SQL files in filename order before startup.
The numeric filename prefixes make their ordering explicit. No environment variables change.

## Rollback

Roll back the frontend first. While generated aliases exist, the old backend can
read projects. After cleanup, restore those two generated aliases using the same
`ADD COLUMN` clause from phase 1 before redeploying the previous backend.
To revert the schema completely, stop the new backend, remove the generated aliases,
then rename `priority_id` back to `erp_reference` and `priority_synced_at` back to
`erp_synced_at` in one transaction. Do not drop the original renamed columns.
