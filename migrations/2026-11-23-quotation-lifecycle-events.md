# Quotation lifecycle evidence

Apply `2026-11-23-quotation-lifecycle-events.sql` before deploying task185.
The official Supabase CLI 3.3.0 generated starter was named
`20261123201728_quotation_lifecycle_events.sql`; this repository uses its documented dated naming convention.

The private table records each successful lifecycle transition in the same transaction
as its quotation update, including immutable actor/time/from/to metadata and explicit
prior approval, rule, warning, payment, rejection and cancellation evidence. Detail
responses expose summary metadata only. No historical entries are fabricated.

RLS and revokes deny browser database roles access; the existing trusted backend
connection inserts and reads records. Update, delete and truncate are rejected by a
trigger, including for the normal backend connection. Quotation deletion is restricted
when lifecycle evidence exists; normal soft deletion remains available. Actor IDs are
immutable snapshots without a user foreign key so user retirement cannot erase history.
No environment variables change. Retain the table on application rollback.
