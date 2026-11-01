# Employee workflow questionnaire

## Architecture and contract

A separate Railway service is packaged under `apps/questionnaire`; it is not part
of the CRM frontend. Its two-route, same-origin proxy calls the existing private
GenAir backend. No public backend domain or broad CORS setting is needed.

`GET /questionnaire/genair-workflow` returns the one accepting immutable version:
`id`, `slug`, `version`, `title`, `introduction`, `definition`. Definitions contain
`key`, `label`, `helpText`, `required`, `type`, and `maxLength`.

`POST /questionnaire-submission` accepts `questionnaireId`, a client-generated
UUIDv4 `requestId`, `fullName`, `role`, `department`, and seven
`answers: [{ questionKey, value }]`. All answer keys must be present; blank answers
are allowed, but at least one answer must contain content. Identity fields are
required, at most 200 characters; answer fields at most 4000. These are
self-reported identities, NOT verified employees. Access is by public link.

Responses contain only `{ id, receivedAt }`, never answer data. Repeating the same
request ID and exact values returns the same receipt, including after closure;
a changed payload returns 409. Transactions and advisory locks serialize retries.
No API reads/lists/edits/deletes responses. Staff access requires a separately
authorized authenticated feature; it is not implicitly public through this form.

Question definitions are versioned JSONB documents. Answers retain their original
strings, including Unicode, newlines, and whitespace, and point to the exact
questionnaire version. Existing definitions and submissions cannot be modified or
deleted through application SQL. Changing questions requires a new version.

## Abuse and privacy boundaries

Only the two controller methods are `@Public`; the global CRM authorization
policy is unchanged. The backend guard caps JSON bodies at 64 KiB after the
framework's 100 KiB parser cap and allows 60 submissions / 300 reads per minute
**per process**, with fixed-memory counters. This intentionally does not trust
forwarded IP headers from the proxy. Restart resets counters; replicas multiply
the quota. Infrastructure distributed rate limiting/CAPTCHA is not claimed.

The separate service additionally bounds request size and rate. Do not log bodies
or submitted values. Backend database failures are translated to a generic error
without logging raw SQL/bind parameters. Do not put submissions in analytics,
public API responses, GitHub, or application source. No automatic Codex memory
integration is provided.

## Rollout and reversal

1. Follow repository feature review + QA and dev → test → main promotion gates.
   Inspect pending branch changes; this feature does not approve unrelated releases.
2. Apply `migrations/2026-11-01-questionnaire-persistence.sql` to the selected
   environment's existing private PostgreSQL DB using its approved migration path.
   Never run `sync({ force: true })` or reset any existing data. This migration
   adds only two tables, associated functions and triggers, and one inactive seed.
3. Ensure the backend role is the table owner/BYPASSRLS, matching the current
   private backend access model. A non-owner role needs explicit narrow grants
   and role-specific policies; do not grant public/anon/authenticated access.
4. Deploy backend with models registered, then the independent frontend service
   using `apps/questionnaire/Dockerfile` and the package README.
5. Enable the seeded form only after health/contract checks:
   `UPDATE public.questionnaires SET accepting_responses = true, updated_at = now()
   WHERE slug = 'genair-workflow' AND version = 1;`
6. Verify public questions, no response listing, validation errors and an explicitly
   labeled synthetic test submission if authorized; never fake a real employee.
   Synthetic data is append-only, so use local/test environments for full write tests.

Emergency closure: set `accepting_responses=false` on this version and stop the
separate frontend service. Keep additive schema and all answers intact; rollback
backend to its previous deployment if needed. Do not drop these tables as rollback.

A new version must preserve its question wording and keys. Close the previous
version and activate the new one in a transaction; only one version per slug can
accept submissions. In-progress clients receive 404 on submission after closure
and must retain/export their draft rather than silently associate it to a new form.
