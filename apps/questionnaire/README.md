# GenAir questionnaire client

Independent public-facing client for the workflow questionnaire. This directory is a separate Node 24 service; it does not start the CRM backend and has no database credentials. It uses the existing backend's questionnaire API via a strict same-origin proxy. There is no account login and names/roles are self-reported, not verified employee identities. No answers or submissions can be read through this service.

## Run and verify

```sh
cd apps/questionnaire
BACKEND_URL=http://127.0.0.1:3000 PORT=3100 npm start
npm test
```

`BACKEND_URL` is required: the existing backend HTTP(S) origin without credentials, path or query. In Railway use the verified existing backend's private service origin, including its port where needed. `PORT` defaults to 3000; Railway supplies its service port. Do not copy production secrets or database configuration here.

For an independently authorized Railway resource: use this directory as the service root and its Dockerfile, same verified existing GenAir project/environment. Health check `/health`. Do not point the existing backend service at this Dockerfile. Provisioning, domain assignment, activation of the questionnaire seed, migrations and production rollout are separate operator actions; this package performs none automatically.

## Data and retry contract

- GET `/questionnaire/genair-workflow` loads the active immutable question version from the backend. The deployed client only supports the agreed three identity keys and seven long-answer keys.
- POST `/questionnaire-submission` saves original Unicode text and whitespace. Identity is required; at least one long answer must be non-blank. All seven answer keys are submitted, including blanks.
- Every attempt uses a browser-generated UUID `requestId`. An unconfirmed attempt retains the exact payload and definition in local storage and freezes editing. Retry or reload reuses the same UUID/payload. Only a valid successful receipt unlocks completion; a timeout is never reported as success.
- A received response is not editable through this client. No public answer-list/read endpoint exists. The backend must independently enforce version consistency, idempotency, limits, and permissions.
- Local pending data is removed after confirmed receipt. Manual drafts and TXT/JSON export remain available. Old-version drafts are not silently rebound to new questions.

## Proxy safety and limits

Only the two exact routes above are forwarded; no arbitrary paths, queries, redirect destinations, user headers, cookies or Authorization are forwarded. The backend origin is fixed at startup. JSON requests are limited to 64 KiB. Requests time out in 15 seconds and the browser retries idempotently. A bounded, process-local rate limiter allows 120 API requests/minute per direct peer IP, ignoring untrusted forwarded headers. Behind Railway ingress that address may be shared, so this is conservative abuse protection, not verified per-employee quota. Multiple replicas require an upstream/shared limiter before broad public rollout. Response data and form contents are not logged.

No third-party scripts, analytics, fonts or images load. The inherited GenAir logo/fonts are embedded. API JSON is rendered with textContent, never interpreted as HTML. Browser visual and full-stack QA remain required before rollout.
