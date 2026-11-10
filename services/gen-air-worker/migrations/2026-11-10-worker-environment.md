# Configure the standalone worker

Date: 2026-11-10. Applies only to this service; no database/schema migration.
Do not add these to the main server until its queue integration is implemented.

| Variable              | Required/default             | Purpose and value shape                                                                                                                   |
| --------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `RABBITMQ_URL`        | Required                     | Broker URI, e.g. `amqps://worker-user:REDACTED@broker.internal/worker-vhost`. Use a secret store. Runtime enforces a 30-second heartbeat. |
| `WORKER_QUEUE_PREFIX` | Optional, `genair.worker.v1` | Environment-specific namespaced prefix, 1–100 letters/digits/dots/underscores/hyphens. Producer/consumer must match.                      |
| `WORKER_PREFETCH`     | Optional, `1`                | Integer 1–8, maximum concurrent unacknowledged work per instance.                                                                         |
| `PORT`                | Optional, `3001`             | Integer 1–65535 for private Nest health endpoints.                                                                                        |

Local Compose supplies example-only credentials. Production requires private
networking/TLS, least-privilege queue permissions and a RabbitMQ 4.1+ deployment
supporting quorum queues and at-least-once dead lettering. This file makes no
infrastructure change. No DB credentials belong in the worker's environment.

Rollback: stop the worker after draining, keep durable queues intact, and restore
the prior worker version only if it understands the same message version. Preserve
failed/results queues for reconciliation. A queue-prefix change needs a deliberate
drain/migration, not deletion of existing queues.
