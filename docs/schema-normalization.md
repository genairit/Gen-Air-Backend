# Schema normalization decisions

The ERD in `database.dbml` reflects the migrations and backend models. A repeated
column is retained only when it records a different fact or preserves information
that the referenced row can no longer supply.

## Removed in the 2026-11-08 migration

| Columns                                     | Source of truth                                                     |
| ------------------------------------------- | ------------------------------------------------------------------- |
| `permissions.feature`, `permissions.action` | The `feature.action` permission key                                 |
| `quotations.rule_config_fingerprint`        | SHA-256 of the stored `rule_configuration`, computed by the backend |
| `project_stage_transitions.updated_at`      | `created_at`; transition rows are append-only                       |
| `questionnaire_submissions.updated_at`      | `created_at`; submissions are append-only                           |

The quotation API still returns `ruleConfigFingerprint` so callers can detect a
rule change without a stored second copy.

## Retained for a concrete reason

| Values                                                                                                       | Reason                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quotation line `sku` and `unit`                                                                              | These are customer-facing terms on the offer. Changing the catalogue must not rewrite an issued offer.                                                                                                                                  |
| Quotation line `description` and `quoted_price`                                                              | These can be edited for the offer and may differ from the catalogue before it is approved.                                                                                                                                              |
| Quotation line `equipment_role`, `capacity_btu`, `includes_remote`, `includes_thermostat` and `control_kind` | These preserve the product facts used by completeness, capacity and double-billing checks. Later catalogue edits must not change an approved offer's validation. `control_kind` remains meaningful if a user edits the line wording.    |
| Quotation line `catalogue_status` and `catalogue_preference`                                                 | These preserve approval warning context. Draft status is checked against the live catalogue; the stored status is refreshed when the offer is approved.                                                                                 |
| `quotations.rule_configuration`                                                                              | An approved offer must keep the exact validation rules under which it was approved.                                                                                                                                                     |
| `quotations.customer_id` alongside `project_id`                                                              | A quotation can be created without a project. The selected paying customer remains the owner of the quotation if the project link later changes.                                                                                        |
| Project customer identity fields alongside `customer_id`                                                     | Legacy projects and apartments may have an end customer recorded inline but no linkable `customers` row. New linked projects clear the duplicate identity fields; floor, apartment and unit are site details, not customer master data. |
| Project and task status beside their transition tables; active user role beside `user_roles`                 | The parent stores current state. Transition and audit rows preserve earlier states; `user_roles` lists roles the user may choose, while `users.role` is the one currently active.                                                       |
| Email recipient IDs beside resolved addresses; catalogue usage counters beside quotation lines               | Recipient addresses preserve where an email was actually sent. Usage counts record each user's selections, including reselections, which current quotation lines cannot reconstruct.                                                    |
| Customer main contact beside `customer_contacts`; customer billing address beside project site address       | The main contact and additional contacts may be different people. Billing and site addresses serve different purposes.                                                                                                                  |
| Questionnaire versions                                                                                       | These preserve the exact form answered by a submission.                                                                                                                                                                                 |

Historical migrations remain immutable; the dated migration removes the redundant
columns from existing databases.

## Retired recovery table

The 2026-11-09 migration removes `project_stage_reset_snapshots`, the one-time
recovery table created by the 2026-10-16 fixed-status migration. No application
code reads it, and the team no longer needs the pre-reset assignments it stored.
This supersedes the earlier migration's instruction to retain that table. The
separate `project_status_change_snapshots` table remains available for the
2026-11-09 engineering status migration.

## Deployment and rollback

This is a coordinated maintenance-window change. Stop all old backend replicas
and pause writes, take a database backup, apply the migration, deploy the matching
backend revision, verify quotation creation and reads plus project transitions and
questionnaire submissions, then resume traffic. Old code writes the removed
columns; new code cannot create a quotation while the old non-null fingerprint
column still exists. Do not serve old and new replicas together.

Reverting only the backend after the migration will fail. To roll back before
resuming writes, restore the pre-migration database backup and the old backend
together. A later rollback needs a forward compatibility migration that restores
and backfills the removed columns, including the rule fingerprint derived from
each quotation's stored configuration, before old code can run.
