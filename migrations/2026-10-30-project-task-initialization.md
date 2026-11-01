# Project task initialization

Apply `2026-10-30-project-task-initialization.sql` with the application stopped for the catalog transition, then deploy this backend before its frontend companion. The old strict catalog reader rejects an extra active status: do not apply the migration under the old running backend. No environment variables change. The backend must continue using its owner/privileged server database role: task access is enforced through the application API, not Supabase Data API roles.

Prerequisite: `2026-10-16-fixed-project-statuses.sql`, including its read-only trigger/function. Draft (`טיוטה`, position 0) becomes the default for future projects. Existing project statuses, assignments, task links, dates and history remain unchanged. Existing tasks receive `general`; there is no existing-project backfill or inference from titles. Inspect legacy customer-only/dual-link counts and existing task-type data before each environment rollout. Development preflight on 2026-10-30 found zero tasks.

The migration enables tasks RLS and revokes PUBLIC/anon/authenticated table privileges; it adds no permissive Data API policy. This keeps task data behind the existing server authorization and does not change row contents.

Types are quotation/planning/general. Public manual creation accepts only General and a project; customer information comes from that project. Protected types cannot be deleted, relinked or changed into another type. The unique project/type index includes completed and soft-deleted rows. General tasks have neither of these protected-type restrictions. Due dates are optional; supplied dates keep nonpast validation. Storage widens to 212 characters so automatic titles include the full 200-character project name; manual title input remains capped at 200.

New projects, manual apartments and imported apartments initialize the same two tasks and their initial histories inside the project/row transaction. Defaults: not_started, no assignee, no due date, not urgent. Initialization retries lock the project initialization key and retain existing task IDs/history. Failure rolls back the project, members/contacts and task/history writes together. Drive publication remains after commit.

Run the SQL twice on a disposable database to verify idempotency, retained data, read-only catalog, default Draft, protected association check and lifetime uniqueness. Review migration tests and targeted QA before shared rollout. This PR prepares the migration; it does not apply it to shared development, test or production.

Rollback requires stopping the new app first. Do not automatically drop task types/rows, truncate generated titles, reassign legacy tasks or remove Draft references. Plan any data rollback explicitly. No destructive down migration is included.
