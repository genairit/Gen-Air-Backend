# Separate questionnaire frontend environment

Configure these only on the new questionnaire frontend service in the existing
GenAir project, individually for development, test and production:

- `BACKEND_URL` — required. Private URL of the **same environment's** existing
  backend, for example `http://gen-air-backend.railway.internal:3000`.
  Verify the actual port before setting it. This is not a credential.
- `PORT` — optional; use Railway's assigned port or the service default documented
  in `apps/questionnaire/README.md`.

No new database, API token, Supabase browser key, or public backend domain is
required. The existing backend DB configuration is unchanged. Do not point a
non-production questionnaire at the production backend.
