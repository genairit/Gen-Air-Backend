# Quotation cancellation rollout

Apply `2026-11-10-quotation-cancellation.sql` to the target database before
deploying the backend that accepts `cancelled`. The migration retains every
existing `approved` value and approval snapshot. It adds a nullable prior
status and an empty JSON history for existing quotations, then expands the
status constraint.

Cancellation requires a nonblank reason (up to 1000 characters). An active
engineer or system admin with quotation update permission may cancel; only an
active system admin with that permission may restore. Each history entry keeps
the reason and actor-name snapshot, including after restoration.

Deploy the backend before the frontend, because the new client expects
`cancelledFromStatus`, `cancellationHistory`, and a `cancelled` status count
in quotation responses.

Before any cancellation is recorded, rollback can restore the previous
application revisions and remove the two added columns and constraints through
an operator-reviewed migration. After a cancellation is recorded, preserve
those columns and deploy a compatibility fix instead; dropping them would erase
the cancellation history and make retained records inaccessible to the old
status constraint.
