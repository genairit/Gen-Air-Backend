# Gen-Air Worker

A standalone **NestJS 11** server for queue jobs. It follows the backend's familiar
`AppModule`, feature module/controller/service, DTO, environment provider, constants,
interfaces and `TypedLogger` layout. It has its own package, lockfile and Nest config.
There is no database module, database client, backend import or shared source dependency.

This is a portable first slice for [card 148](https://trello.com/c/irqulidN).
It does **not** change the main API, migrate an existing endpoint, deploy infrastructure,
or complete the card's production rollout and application-responsiveness acceptance.

## Start locally

Node 24 and npm are required. Run commands from this folder:

```sh
npm ci
npm run check

docker compose up --build -d
curl --fail http://localhost:3001/health/ready
RABBITMQ_URL='amqp://worker:local-worker-only@localhost:5672' npm run demo
```

Compose starts an isolated local RabbitMQ 4.1 broker and the worker. All published
ports bind only to localhost. The example credentials are **local-only**. Broker
queues survive container restart in the named volume. `docker compose down` keeps
that data; do not delete the volume while jobs/results need recovery.

To run Nest outside Docker, start only `docker compose up -d rabbitmq`, copy
`.env.example` to `.env`, then run `npm run start:dev`. Production-style local
execution is `npm run build && npm run start:prod`.

- `GET /health/live`: Nest process responds.
- `GET /health/ready`: 200 only while the queue consumer is ready, otherwise 503.
- No HTTP endpoint accepts jobs. Only the trusted main server publishes jobs.

## Familiar structure

```text
src/main.ts                         Nest bootstrap and validation pipe
src/app.module.ts                   EnvironmentModule + WorkerModule
src/providers/environment/          ConfigModule and Joi validation
src/modules/worker/                 Controller, queue service, job service
src/dto/job.dto.ts                  Validated versioned message envelope
src/handlers/report.handler.ts      Pure report calculation
src/constants/, interfaces/        Protocol constants and result shapes
src/logger/logger.service.ts        Typed, payload-free structured logging
```

The queue service owns connection, confirms, acknowledgments and shutdown. The
worker service owns job outcomes and retries. The job service runs the pure report
handler in one disposable Node worker thread per job, so CPU work does not block
RabbitMQ heartbeats or health checks. This is not another service or dependency.
A timeout terminates the actual thread, rather than merely abandoning a promise.

## Job and result contract

The main server must authorize the request, read the required database rows itself,
create an immutable job snapshot and publish the complete payload. A broker-confirmed
publish means **queued**, not completed. Use the same job ID when a publish outcome
is uncertain; do not change the data associated with an existing job ID.

Job envelope (JSON, maximum 1 MiB):

```json
{
  "version": 1,
  "jobId": "a-unique-job-id",
  "tenantId": "authorized-tenant-id",
  "jobType": "report.csv.v1",
  "attempt": 1,
  "payload": {
    "headers": ["Apartment", "Issue"],
    "rows": [["12", "Missing customer phone"]]
  }
}
```

The first pure handler exports supplied tabular data to CSV. It is inspired by the
backend's apartment import error-report work, but does not replace that XLSX report
or change its business behavior. All cells are strings, every row matches the header
count, and limits are 10,000 rows, 50 columns and 1,000 characters per cell. The JSON
message-size limit applies too. CSV quotes/newlines are escaped and formula-looking
cells get a leading apostrophe, including after leading whitespace.

The terminal result has `version`, `jobId`, `tenantId`, `jobType`, `attempt`,
`completedAt`, `status` (`succeeded` or `failed`), `error` (code or null) and `output`
(`{csv, rowCount, contentType}` or null). Result output is capped at 4 MiB. There are
no callbacks, arbitrary reply queues, file-system paths or fetch URLs in a job.

The main server consumes results and owns all database updates, permissions and UI
status. Before acknowledging a result it must validate the contract and tenant/job
match, and transactionally persist the outcome with idempotency keyed by
`(tenantId, jobId)`. Never overwrite an already successful job with a later failure.
If that transaction fails, leave the result unacknowledged for redelivery.
`examples/main-server.mjs` demonstrates only the queue round trip with synthetic
data; printing a result is not a production persistence/idempotency implementation.
Use it only with a dedicated local demo queue prefix, never shared result queues.

## Queue choice and delivery guarantees

RabbitMQ is the initial adapter: it supports durable quorum queues, manual consumer
acks and publisher confirms without giving the worker a database connection. BullMQ
would also be viable but requires Redis; no existing broker was found in the backend.
The versioned JSON contract keeps a future transport change possible.

For prefix `genair.worker.v1` the worker declares:

- `.jobs`: durable quorum work queue with manual acknowledgments.
- `.results`: durable quorum result queue consumed by the main server.
- `.failures`: durable quorum queue for operator inspection/recovery.

Each queue has a 64 MiB ready-message budget with reject-publish overflow rather
than silent eviction. Size, disk and backlog must be monitored and tuned before a
production rollout. Retention is explicit: no automatic TTL discards jobs or results.
A one-node local broker is persistent, not highly available; production quorum
replication needs a suitable cluster.

Delivery is **at least once**, not exactly once:

1. Success is acknowledged only after the broker confirms a persistent result.
2. Transient execution failures and real 30-second timeouts retry up to three logical
   attempts, with 5- and 10-second delays. Prefetch slots stay occupied during the
   delay, bounding retry load. Validation failures are not retried.
3. A retry is confirmed before the original is acknowledged. A crash between those
   steps can duplicate work; the sample handler has no external side effects.
4. Terminal failures publish a failed result and a failure record before acknowledgment.
   A crash may duplicate these records. Malformed envelopes go only to `.failures`
   with an input hash, not untrusted input or an invented job/tenant ID.
5. Broker/channel/publication failures fail the process after a bounded drain. The
   supervisor restarts it and RabbitMQ redelivers unacknowledged jobs. Connect and
   publish timeouts are 10 seconds; negotiated heartbeat is 30 seconds.
6. RabbitMQ limits repeated unacknowledged delivery of each job message to 10,
   then uses at-least-once dead lettering to `.failures`. These broker-generated
   entries contain the original job and `x-death` headers, not the worker failure
   wrapper. They may have no terminal result; the main server needs stale-job
   reconciliation and operators must monitor this queue. Results/failures have
   no delivery limit to avoid silently discarding them.

SIGTERM cancels consumption, drains active jobs and closes the connection. A single
45-second watchdog covers the whole sequence, including broker RPCs, and forces a
nonzero process exit if it stalls so unfinished deliveries return to the broker. Give the supervisor at
least 60 seconds before forcing termination. No process-local cache claims to prevent
duplicate work across worker replicas. Future handlers must stay pure or supply
idempotency for every external side effect before being enabled.

## Configuration and operations

See [the environment migration](migrations/2026-11-10-worker-environment.md).
Production is deliberately not provisioned by this change. Before rollout:

- Use a private broker network, TLS (`amqps`) and separate least-privilege producer,
  worker and result-consumer credentials/vhost. Never reuse Compose credentials.
- Keep health endpoints on a private network. Queue payloads/results/failures can
  contain user data: minimize snapshots, restrict broker access, encrypt transport
  and storage, and define retention/deletion with the application owner.
- Do not pass DB credentials or the main server's secrets to the worker. The image
  runs as a non-root user. Logs contain only status, job ID and attempt, never
  payloads, results, raw broker errors or connection URLs.
- Start with prefetch 1. Increase it only after measuring peak memory/CPU per job.
  Each running job gets a thread with a 128 MiB old-generation limit; that is not
  a complete process-memory cap. Keep container CPU/memory limits too.
- Monitor ready/unacknowledged counts, oldest pending job, failures, retries, result
  backlog, broker disk alarms, restarts and health. Queue metrics come from RabbitMQ;
  no monitoring vendor is configured.
- Inspect failures against the main server's job record. Fix the cause before replay.
  Reuse the immutable job identity and reset attempt only through an authorized
  operator workflow. Do not replay successful jobs or purge queues blindly.
- Existing queues with incompatible arguments cause startup failure. Use a new
  versioned prefix and drain old queues; never silently delete live queues.

## Verification

```sh
npm run check
# Optional real broker test; uses unique disposable queues and removes only those:
TEST_RABBITMQ_URL='amqp://worker:local-worker-only@localhost:5672' npm run test:integration
```

The default tests cover contracts, CSV safety, result/ack ordering, retries and
terminal failures, publisher confirms/nacks/returns, real job-thread execution and
Nest HTTP health. The integration command requires a disposable localhost RabbitMQ
4.1+ broker and fails explicitly if one is not configured. It exercises the real
queue round trip, duplicate output, failure paths and worker readiness during a
2,500-row export. This is not a performance result for the main application.

The implementation environment had no Docker/RabbitMQ executable: a successful
unit/component test run is not evidence of a tested Docker image or live broker.
Live broker recovery, production TLS/ACLs, shared application load and full
repository feature QA must be verified before PR/rollout approval.

## Move to a new repository later

Copy **this entire folder** to the new repository root, including its dotfiles and
lockfile, then run `npm ci && npm run check`. Build Docker with that folder as the
context. No file in this service imports the parent repository. Backend TypeScript
configs exclude `services` so this Nest app is not built into the main server.
The root migration is only an index pointer; this folder includes its own migration.

Next scope decisions remain: choose the first real task, integrate the main server's
outbox/job status/result transaction, define hosting and resource targets, and prove
normal app responsiveness under representative concurrent load.
