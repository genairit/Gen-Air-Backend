# Retire Questionnaire deployments and configuration

Owner-authorized removal,13November2026.

Before deploying the matching backend, set `AUTH_CLIENT_SECRET` to an independent random secret of at least32characters in each environment. It signs the existing CRM anonymous caller cookie used for login rate limits; the cookie name and protections remain unchanged. Replacing this caller-signing secret does not change employee passwords or JWT sessions.

After the backend is healthy, remove `QUESTIONNAIRE_CLIENT_SECRET` from its environment. Delete the dedicated Questionnaire service and public domains in development, test and production. Remove no backend, frontend, Worker or broker service.

Apply `20261113084752_remove_gen_air_questionnaire.sql` only after the matching backend is running and Questionnaire traffic is stopped. This intentionally removes saved forms/answers. Historical applied migrations stay immutable so fresh databases can replay history and then apply retirement.

Owner waived full suites and automated checks for this task. Deployment health and schema observations are recorded separately; no passing test result is claimed.
