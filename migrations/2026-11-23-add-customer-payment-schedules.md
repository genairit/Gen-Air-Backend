# Customer payment schedules

Apply `2026-11-23-add-customer-payment-schedules.sql` before deploying this version.
The additive migration adds `customers.payment_schedule` as a non-null JSONB array with an empty
array default. No environment variables are required. Apply to development for this feature;
later promotions must apply the same migration in test and production before deploying the code.

Existing `payment_terms` values and quotation-local notes remain unchanged. There is no customer
payment-note column in the current schema. Existing `other` with no stages remains an unconfigured
legacy preference, readable without preventing unrelated customer edits. Do not convert it to a
preset or invent stages. A new quotation uses the existing no-preference fallback for this legacy
state. No previously saved quotation is rewritten by this migration or by later customer edits.

## Contract

Customer create/PATCH accepts `paymentTerms` and optional `paymentSchedule` stages shaped as
`{ "percent": "30", "text": "בחתימה" }`. Read responses include `paymentSchedule`, defaulting to `[]`.
Supported configurations are:

- Unset: `paymentTerms: null`, `paymentSchedule: []`.
- Fixed preset: supported fixed `paymentTerms`, empty stages.
- Custom: null terms and stages with descriptions, exact Decimal total 100, at most 30 stages,
  percentages between 0 and 100 with at most four decimal places, and descriptions up to 300 characters.

PATCH validates the effective configuration under the customer row lock. Omitted fields keep
their persisted values; clear a custom schedule explicitly with null terms and an empty stage
array. Switching to a preset requires clearing existing stages. An unchanged legacy `other`/empty
configuration can round-trip, but new bare `other` preferences must be configured or cleared.
Invalid customer defaults return `INVALID_CUSTOMER_PAYMENT_CONFIGURATION` with HTTP 400.

New quotations copy the configured customer terms and stage values into their own snapshot.
Quotation changes, sibling quotations and later customer-default changes remain independent.
Changing the customer of an existing quotation does not silently overwrite any quotation payment
field; the client offers an explicit replacement action and retains the quotation-local note.
Quotation drafts retain their existing incomplete-save behavior; approval still enforces required
payment rules using the shared validation logic.

## Verification and recovery

Verify column type `jsonb`, nullability `NO`, and default `'[]'::jsonb` in
`information_schema.columns`. Exercise custom/preset/unset creation, omitted/cleared PATCH values,
legacy Other, snapshot independence and permission-denied requests against a disposable database.
No background migration or maintenance outage is required.

An application rollback may leave the additive column and data in place. Do not drop the column
while any deployed service reads it; dropping it would erase customer custom schedules. Existing
quotation snapshots and legacy payment values must remain intact.
