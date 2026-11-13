# Restrict direct Supabase Data API access

Apply `migrations/2026-11-04-restrict-public-data-api.sql` and then
`migrations/2026-11-04-revoke-public-default-object-grants.sql` as the
`postgres` database owner in development, test, and production. Apply
`2026-11-04-auth-session-and-login-limits.sql` before both. The second script
closes schema-specific PUBLIC default grants left by the first and revokes
access to any objects created between them. The Nest backend
uses its owner database connection; browser clients use Nest endpoints and do
not need Supabase Data API table grants.

The migration revokes direct access to current public tables, sequences, and
application-owned functions from `anon` and `authenticated`, enables RLS on
non-extension public tables, and removes `postgres`' future automatic
public-schema grants, including grants inherited through PUBLIC. It also
pins four existing trigger functions to `pg_catalog, public`. Extension-owned
functions remain under extension management. The owner keeps
access. Future functions created by `postgres` in any schema will require an
explicit `EXECUTE` grant if an unprivileged role must call them.

After each environment, check `pg_class.relrowsecurity` for public application
tables and `has_table_privilege`, `has_sequence_privilege`, and
`has_function_privilege` for `anon` and `authenticated` on both existing and a
new temporary object of each kind. Supabase's Database
Security Advisor should no longer report `rls_disabled_in_public` for those
tables. Backend-only tables with RLS and no policy are expected. Verify Nest
login and CRM reads and writes through the backend.

Disable the Supabase Data API in project settings as an additional boundary
after confirming no external integration uses it. Restricting Data API grants
does not remove any previously exported data or invalidate an already exposed
database credential.
