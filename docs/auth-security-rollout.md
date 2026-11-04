# Login abuse limits and password rotation

The backend stores login counters in `public.auth_login_attempts`, shared by all
backend replicas. Apply `migrations/2026-11-04-auth-session-and-login-limits.sql`
before deploying the backend. The limits are 10 attempts per signed browser
cookie and 100 attempts per account in 15 minutes, plus 300 login attempts
globally per minute. A successful login clears only the account counter.

The global limit bounds password hashing when an attacker discards the browser
cookie and sprays different email addresses. During a sustained attack it can
temporarily return 429 to legitimate users. Add a trusted ingress IP limit at
the edge when the proxy's forwarded client address can be authenticated; do not
trust arbitrary client-supplied forwarding headers in the application.

After applying the schema and starting the new backend code, keep public login
traffic paused while running `npm run rotate-legacy-password -- --audit` and
rotating every listed active account with `--email <address>`. The audit checks the exact
former shared password, `temp1234`; login rejects that same exact value. Each
rotation increments `session_version` in the password transaction. Repeat the
audit until it reports zero affected accounts, then open login traffic. If
traffic cannot be paused, affected accounts remain locked out until rotated.
