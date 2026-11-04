# Add QUESTIONNAIRE_CLIENT_SECRET

Date: 2026-11-04

## What to add

`QUESTIONNAIRE_CLIENT_SECRET` — required on both the GenAir backend and the separate questionnaire proxy. Set the same value on those two services within an environment, and use a different value in each environment.

## Why

The services sign and verify the anonymous caller cookie used for separate login and questionnaire quotas. A mismatched value makes the backend reject the proxy's caller identity and creates a new one on every proxied request.

## Value

A cryptographically random string of at least 32 characters, such as the output format of `openssl rand -hex 32`. Store the value in each service's deployment secret store. Rotating it resets anonymous caller cookies and their quotas.

## Deployment order

Apply `2026-11-04-auth-session-and-login-limits.sql` before deploying the backend code. Set this variable on both services before starting either updated service. The backend also requires the new `users.session_version` column and `auth_login_attempts` table before login or password changes can run.

The former shared password `temp1234` is blocked for both new and existing accounts. Before rollout, run `npm run rotate-legacy-password -- --audit` in each environment with backend database access. For each listed email, run `npm run rotate-legacy-password -- --email <employee-email>` and enter a unique new password through the non-echoing prompt, then deliver that password through an approved private channel. The rotation increments the user's session version and invalidates earlier JWTs. Repeat the audit until it reports zero affected accounts. The audit does not print password hashes or new passwords.
