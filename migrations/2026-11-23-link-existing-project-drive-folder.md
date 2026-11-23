# Link existing project Drive folders

Apply `2026-11-23-link-existing-project-drive-folder.sql` before deploying this version.
It adds `projects.drive_folder_linked` (false for existing automatic folders) and a live-folder
unique index. No environment variables or credentials are introduced.

Preflight existing duplicate non-null folder IDs before migration:

```sql
SELECT drive_folder_id, count(*) FROM projects
WHERE deleted_at IS NULL AND drive_folder_id IS NOT NULL
GROUP BY drive_folder_id HAVING count(*) > 1;
```

Resolve any duplicates explicitly; do not rewrite existing assignments automatically. Development
preflight was clean on 23 November. Apply only to development for this feature; later promotion
must apply the same migration in test and production.

## API and behavior

- POST `/project-drive/existing-folder/preview`: `{reference, buildingId?}` resolves folder ID/name
  and `missingTemplateFolders` without changing Drive. Project-create permission is required.
- Project/apartment create accepts optional `existingDriveFolder` (folder ID or HTTPS Drive folder
  URL). The service account must see a non-trashed folder beneath the configured company root.
  The root itself and folders overlapping another live project are rejected. Apartment folders
  must already be inside the selected building's unique `דיירים` folder.
- Folder identity and linked mode are committed before project-created provisioning runs. Normal
  creation without the option keeps its existing automatic behavior, including unavailable-Drive
  handling. Linked folders are never renamed, moved or automatically filled by event/read/retry.
- Drive contents adds `missingTemplateFolders` for linked folders. Matching existing template
  children are reused; ambiguous duplicate names are rejected rather than guessed.
- POST `/project-drive/:projectId/complete-template` explicitly fills missing template folders
  idempotently, with project-update permission. It never replaces/removes existing contents.

## Verification and rollback

Verify preview, create and reload, existing contents, inaccessible/trashed/file/outside-root
rejection, duplicate ownership, apartment location and explicit template completion/retry.
Existing folders must not gain new children merely from creating a linked project or reading it.

Stop automatic provisioning before rolling application code back. Keep linked-folder data available for recovery; dropping
`drive_folder_linked` loses the read-only provisioning distinction, so an old application must not
run automatic provisioning on linked projects. Drop the index/column only after reviewing linked
projects and stopping provisioning. No automatic destructive rollback is provided.
