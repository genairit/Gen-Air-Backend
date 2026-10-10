# Migrations — Document Every Schema and Environment Change

Server work that changes how the application is deployed or stored must leave a trace. If a task
touches the **database schema** — adding entities, changing columns, dropping tables — or requires a
**new environment variable**, that change is not finished when the code compiles: it must be
documented as a migration in the repository's `migrations` folder.

**Golden rule:** code changes describe how the app behaves; migrations describe what an operator has
to do to the database and the environment before that code can run. Never leave the second half
implicit.

---

## 1. When a Migration Is Required

Create a migration whenever the task involves any of the following:

- **Adding or removing entities** — new tables, dropped tables, join tables.
- **Changing columns** — adding, renaming, retyping, or removing a column; changing nullability,
  defaults, indexes, or constraints.
- **Adding environment variables** — any new key the server reads at runtime.

If the task only changes application logic and touches none of the above, no migration file is
needed.

## 2. One File per Migration, Named for Purpose and Date

Every migration is a single new file in the `migrations` folder, named for **what it does** and
**when it was written**:

```
migrations/<YYYY-MM-DD>-<short-purpose>.sql   # schema changes
migrations/<YYYY-MM-DD>-<short-purpose>.md    # environment-only changes
```

```
migrations/2026-08-22-add-users-table.sql
migrations/2026-08-22-add-redis-connection-env.md
```

The purpose must read as the intent of the change, not as a ticket number. Never edit an existing
migration file after it has been applied — write a new one.

## 3. Schema Changes → SQL Script **and** Updated ERD

A schema migration has two deliverables. Both are mandatory; one without the other is an incomplete
migration.

**a. The SQL script.** Write the statements that take the database from its current shape to the new
one — `CREATE TABLE`, `ALTER TABLE ... ADD COLUMN`, `DROP TABLE`, index and constraint changes.

```sql
-- Purpose: add the users table backing the new registration flow.
-- Date: 2026-08-22

CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       VARCHAR(255) NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users (email);
```

**b. The ERD.** Update the repository's ERD file (for example `database.dbml`) in the same change so
the diagram matches the tables the SQL just created. The ERD is the readable source of truth for the
schema — a migration that changes tables without updating it leaves the diagram lying.

```dbml
Table users {
  id         uuid       [pk, default: `gen_random_uuid()`]
  email      varchar(255) [not null, unique]
  created_at timestamptz  [not null, default: `now()`]
}
```

Keep both sides consistent: every table, column, type, and relation added in SQL appears in the ERD,
and anything dropped in SQL is removed from it.

## 4. Environment Variables → State What to Add and Why

A new env var is a deployment step, so it gets its own migration file. The file does not run
anything — it tells whoever deploys the service exactly what to set. Record:

- **The variable name**, in the exact casing the server reads.
- **Why it is needed** — the feature or integration that depends on it.
- **Whether it is required or optional**, and the default when optional.
- **The shape of the value**, with a non-secret example.

```md
# Add REDIS_URL

Date: 2026-08-22

## What to add

`REDIS_URL` — required.

## Why

The new rate-limit guard stores request counters in Redis instead of in process memory, so the
server cannot start without a reachable Redis instance.

## Value

A Redis connection string, for example `redis://localhost:6379`.
Each environment gets its own instance; use that environment's host.
```

**Never write a real secret into a migration file.** Document the variable's name, purpose, and
format only — the value itself belongs in the environment, never in the repository.
