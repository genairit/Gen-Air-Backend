# Require a trusted database CA and SMTP TLS

Date: 2026-11-04

## What to add

Set `DB_SSL_CA` on each Railway `Gen-Air-Backend` service in development, test, and production before deploying this backend revision. It is required whenever `DB_SSL=true`; there is no default. Download the server root certificate from that environment's Supabase project under **Database Settings → SSL Configuration → Download certificate**. Store the complete PEM certificate, including its `BEGIN CERTIFICATE` and `END CERTIFICATE` lines and embedded newlines, as the variable value. Do not commit the certificate or a database password to this repository.

The development project's certificate has been set in Railway without triggering a deployment. Test and production still require this variable before this backend revision is deployed there. The previously used `DB_SSL_REJECT_UNAUTHORIZED=false` setting is ignored by this revision and can be removed from each environment after the new variable is in place.

## Why

The backend now verifies the PostgreSQL server's certificate chain against `DB_SSL_CA` and checks that the certificate matches `DB_HOST`. Missing or incorrect CA material causes startup to fail rather than accepting an unverified database peer. This supersedes the TLS bypass documented in `2026-10-18-add-hosted-environments-env.md`; that historical migration remains unchanged.

Quotation execution email also requires STARTTLS when using port 587. The SMTP server must offer TLS, or delivery fails. Port 465 continues to use TLS on connect.

## Value format

`DB_SSL_CA` is the complete PEM root certificate downloaded from the matching Supabase project. Its shape is:

```text
-----BEGIN CERTIFICATE-----
<base64 certificate body from Supabase>
-----END CERTIFICATE-----
```

Use the exact `DB_HOST` from the same environment's Supabase **Connect → Session pooler** details. Do not substitute a certificate copied from an unrelated source.
