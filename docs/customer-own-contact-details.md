# Customer main contact details

`customers.primary_contact_id` identifies the customer's own main phone and email.
Read that explicit relation; directory ordering never determines customer details.
No schema migration or environment variables are required for this change.

- `POST /customer` accepts optional `phone` and `email` without a separate person's
  name. A dedicated `customer_contacts` row is created with `customer_id` set to
  the new customer and its internal name derived from the customer name. Both
  details may be null.
- `PATCH /customer/:id` accepts optional `phone` and `email`. An omitted field
  stays unchanged; null or blank clears it. The existing customer update
  permission is sufficient. A separate `contactName` update is rejected.
- Legacy `primaryContactId` on create and `PATCH /customer/:id/primary-contact`
  copy the selected contact's details into an owned snapshot. They never assign
  an unrelated mutable directory row directly. A null legacy selection clears
  the explicit relation.
- Changes lock the customer and current contact within the same transaction.
  A legacy unowned contact, a different owner's contact, or a contact referenced
  by another customer or project is copied before repointing this customer.
  The original remains unchanged. An exclusive own contact can be updated in
  place. Returning to an identical owned snapshot reuses it to respect the
  existing per-customer active-tuple constraint.
- New directory searches and import matching exclude contacts currently designated
  as an active customer’s primary contact. Legacy non-primary and detached
  contacts remain reusable regardless of their historical `customer_id`.
  Project contact links continue to read their exact linked identities.
  Directory edits of currently customer-designated contacts return
  `CUSTOMER_OWN_CONTACT_MANAGED`; edit those details through the customer page.
- Existing records are not bulk rewritten. Apartment imports retain transactional
  row handling and explicit identity matching; newly created customer details
  receive their own records. Quotation recipient fallback continues to use the
  explicitly designated customer primary contact.
