# Engineering project statuses

Apply `2026-11-09-engineering-four-project-statuses.sql` to each environment before deploying the matching backend. Deploy the matching frontend after the backend. No environment variables change. Stop application writes and take a database backup before the migration; the transaction locks project definitions, assignments, and transition history.

The active, read-only status catalogue becomes exactly:

1. טרם בעבודה — `6502a045-2a7d-4bc8-8ba1-36eaedc49a05`
2. בעבודה — `6502a045-2a7d-4bc8-8ba1-36eaedc49a02`
3. מחכה לתשובה — `6502a045-2a7d-4bc8-8ba1-36eaedc49a06`
4. הושלם — `6502a045-2a7d-4bc8-8ba1-36eaedc49a07`

New projects and apartments start at טרם בעבודה. Existing Draft and Waiting projects map to טרם בעבודה; In Progress stays בעבודה; On Hold maps to מחכה לתשובה; Completed maps to הושלם. The same mapping covers soft-deleted projects. The migration does not touch task or quotation statuses and does not generate user transition events. It leaves `projects.updated_at` unchanged.

The old Draft, Waiting, On Hold, and Completed definitions are archived with their original IDs and names. Transition history joins those archived definitions, so historical labels remain as originally recorded. Only בעבודה retains its prior active ID. `project_status_change_snapshots` records the previous status ID and timestamp for each remapped project. The snapshot table has RLS enabled and no PUBLIC, `anon`, or `authenticated` grants. A rerun leaves later status changes untouched.

## Verify

After applying the SQL, check that `GET /project-stage` returns the four rows in the order above and that creating a project or importing apartments initializes status `a05`. Check board, project form/detail, apartment status tabs, building and customer counts/filters, and read-only Settings. For an environment with existing transitions, open a timeline containing an old renamed status and confirm its original name remains visible. Confirm direct catalogue writes still fail and old status IDs cannot be assigned through the project API.

## Recovery

If migration or deployment fails before writes resume, restore the pre-migration database backup and previous application release together. The snapshot table supports inspecting exact previous assignments before recovery. Do not replay old application code against the new catalogue: it expects five active statuses. If writes have resumed, preserve the new backup and assess later changes before any restoration; never overwrite newer status changes with snapshot values automatically.
