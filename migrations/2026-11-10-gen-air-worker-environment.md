# Add the optional standalone Gen-Air worker

Date: 2026-11-10. No schema or main-server environment changes.

The independently run NestJS service is in `services/gen-air-worker` and is excluded
from the main backend TypeScript build. Its complete environment setup and rollback
instructions travel with it in
[`services/gen-air-worker/migrations/2026-11-10-worker-environment.md`](../services/gen-air-worker/migrations/2026-11-10-worker-environment.md).

The service reads `RABBITMQ_URL`, `WORKER_QUEUE_PREFIX`, `WORKER_PREFETCH` and `PORT`.
Do not deploy or configure the main server to use it until its separate job/result
integration and rollout verification are approved.
