# Add JWT_SECRET

Date: 2026-10-07

## What to add

`JWT_SECRET` — required.

## Why

Login (`POST /auth/login`) issues a signed JSON Web Token, and every other endpoint verifies it.
The server refuses to start without it.

## Value

A long random string, at least 32 characters, for example the output of `openssl rand -base64 48`.
Use a different value in every environment. Changing it logs every user out.

## After deploying

Create the first system admin once, after the schema migration has run:

```bash
npm run build
npm run create-admin -- --first-name <first> --last-name <last> --email <email> --phone <phone> --password <temporary-password>
```
