# Add hosted environments (development, test, production)

Date: 2026-10-18

## What to add

Gen Air now runs three isolated environments. Each is a Railway environment with its own backend
service and its own Supabase project, under the Gen Air accounts:

| Environment | Branch | Supabase project | Railway environment |
| ----------- | ------ | ---------------- | ------------------- |
| development | `dev`  | `gen-air-dev`    | `development`       |
| test        | `test` | `gen-air-test`   | `test`              |
| production  | `main` | `gen-air-prod`   | `production`        |

Set every key below in **each** environment's `Gen-Air-Backend` service variables. `.env.example`
lists the same keys for local development.

- `PORT` — required on Railway, `3000`. The client service reaches the backend at this port over
  the private network.
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS` — required. That environment's Supabase
  **Session pooler** connection (Supabase → Connect → Session pooler), because the direct
  connection is IPv6-only.
- `DB_SSL` — `true` on Railway. Supabase rejects unencrypted connections.
- `DB_SSL_REJECT_UNAUTHORIZED` — `false` on Railway. Supabase's certificate is not in Node's
  default CA bundle; the connection is still encrypted.
- `JWT_SECRET` — required, see `2026-10-07-add-jwt-secret-env.md`. A different value per
  environment, so a token from one environment is rejected by the others.
- `GOOGLE_DRIVE_ROOT_FOLDER_ID` — for now, the production folder in every environment (decided on
  2026-10-18). Projects created in development and test therefore also create folders in the
  production Drive; give each environment its own folder before test data becomes noisy.
- `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON`, `GOOGLE_PLACES_API_KEY` — as in their own migration files;
  these may be shared between environments.

## Why

Development, test and production must never share data or secrets: work being tested cannot touch
real customer data, and a leaked development secret cannot open production.

## Value

```dotenv
PORT=3000
DB_HOST=aws-0-eu-central-1.pooler.supabase.com
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres.abcdefghijklmnopqrst
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=false
```

Never write a real password, secret or key into this file.

## After deploying

1. Apply every file in `migrations/` in date order to each Supabase project (SQL editor or
   `psql`), so every schema matches `database.dbml`.
2. From now on, apply each new migration to development, then test, then production.
3. Create the first system admin in each environment, with that environment's variables
   (`railway run --environment <environment> --service Gen-Air-Backend`):

```bash
npm run build
npm run create-admin -- --first-name <first> --last-name <last> --email <email> --phone <phone> --password <temporary-password>
```

The backend has no public domain. Only the `Gen-Air-Frontend` service of the same environment
reaches it, through the private network.
