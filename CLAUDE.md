# CLAUDE.md

This file consolidates development workflows and points to the canonical agent standards.

---

## Developer Agent and Development Standards

For implementation, read [the developer agent](agents/developer-agent.md) in full.
Its numbered standards are canonical for implementation and review.
For client-facing UI, reuse existing generic components as much as possible and
follow the design agent's handoff before implementation.

---

## Backend Development Workflow — From Board Task to Merge Request

Every piece of work starts on the board and ends on the board. A task is not "in progress" because
someone is typing, and it is not "done" because the code compiles — the board must reflect reality at
each step, and the task itself must carry the evidence that the work was finished.

**Board:** [Team's Goals](https://trello.com/b/0YGKf1tR/teams-goals)

**Golden rule:** never touch code before the task is understood and moved to the active list and a
branch exists for it, and never open a merge request before the code review agent reports no findings
and the QA agent reports PASSED, with its report and the proof of completion attached to the task.

---

### 1. The Flow

The steps below are ordered and mandatory. Do not skip a step, and do not reorder them.

1. **Take the task** — the user gives the link to the task on the board.
2. **Read the task and understand its requirements** from that link.
3. **Move it to the active list** on the board, so the board shows who is working on what.
4. **Branch from `dev`** using the task's name.
5. **Run the [developer agent](agents/developer-agent.md)** to implement the
   task on that branch.
6. **Review the changes with the code review agent** — fix every finding it reports, delete its
   `// CR:` annotations, and review again until it reports none.
7. **Run the [QA agent](agents/qa-agent.md)** against the exact feature revisions; fix failures
   through the responsible agent and repeat until it reports **PASSED**.
8. **Attach proof of completion** to the task — evidence plus a summary of what was implemented.
9. **Open a merge request** from the branch into `dev`.
10. **Attach the merge request link** to the task.

### 2. Open the Link and Understand the Task First

The user hands you a **link to the card on the board** — that card, not your assumption of what the
title means, is the specification. Before anything else, open it and read it in full:

- **The description** — the actual requirement and the behavior expected when it is done.
- **The checklists and acceptance criteria** — each one is a condition the implementation must meet.
- **The attachments and comments** — designs, screenshots, reference links, API contracts, and any
  decision already made on the card.
- **The labels and due dates** — the scope and the part of the system the task belongs to.

Restate the requirement back to the user in your own words before starting, and **ask about anything
ambiguous or missing while the task is still in the backlog**. Do not invent scope the card does not
ask for, and do not silently drop scope it does. Everything the card requires is what "done" means
later, when you attach the proof.

### 3. Move the Task to the Active List

Once the task is understood, move it into the **active list** on the board. This happens **before any
code is written**, so the board never shows work sitting in the backlog while it is actually being
built.

If the task is still unclear, resolve it with the user _before_ moving it — the active list means
"being worked on right now", not "being figured out".

### 4. Create a Branch from `dev`, Named for the Task

All work happens on a dedicated branch cut from the **latest `dev`**, never directly on `dev` and
never on a branch carried over from an unrelated task. Create it with the **`gh` CLI**, which cuts
the branch from `dev` on the remote and checks it out locally:

```bash
gh repo sync
gh api repos/:owner/:repo/git/refs -f ref="refs/heads/<task-name>" \
  -f sha="$(gh api repos/:owner/:repo/git/ref/heads/dev --jq .object.sha)"
git fetch origin <task-name> && git checkout <task-name>
```

The branch name is the **name of the task** on the board, lowercased and hyphenated, so a branch can
always be traced back to the card it belongs to. For a repository without `dev` (such as
Spec-Development-Component), use its latest default branch as the branch and PR base instead.
Use an available GitHub connector or Git CLI equivalent when `gh` is unavailable.

```
add-user-registration-endpoint
fix-dashboard-filter-reset
```

### 5. Implement With the Developer Agent

Run the [developer agent](agents/developer-agent.md) with the complete
requirements. Write the code for that task and that task only. Work outside
the card belongs on a different branch.

Apply the developer agent's numbered development standards, the migration rules, and
the feedback loops that prove the change actually works.

### 6. Review the Changes With the Code Review Agent

When the implementation is finished and verified, run the [code review agent](agents/code-reviewer.md) on
the branch in **Mode B** (local changes against `dev`) before anything leaves your hands. Run it in a
fresh context whenever the toolchain allows, and give it the card link so it can judge the diff
against the requirements as well as the standards.

- **It reports findings** — any PR Hygiene alert, Critical violation, or Refactoring suggestion is a
  required fix. Fix them on the same branch, delete every `// CR:` annotation it inserted, re-run the
  feedback loop that proves the change still works, and run the review again on the full diff.
  Repeat until the review comes back clean.
- **It reports no findings** — continue with the flow: run the QA agent as the next step.
  A clean code review alone does not authorize proof or a feature merge request.

Do not skip the review because a change looks small, and do not dismiss a finding without either
fixing it or resolving it with the user. A merge request opened while findings or `// CR:`
annotations remain breaks the flow.

### 7. Run the QA Agent and Resolve Its Results

After code review reports no findings, invoke the [QA agent](agents/qa-agent.md) in a fresh
context with the card, both app feature refs and diffs, clean review result, and Automation repo.
It maintains Playwright coverage in Gen-Air-Automation, runs targeted QA and relevant unit checks
against those exact revisions, opens the Automation PR, and returns the structured PASSED/FAILED report.

Feature → dev requires code review, relevant unit checks and targeted QA, with maintained
Automation coverage for new features. Do not run full regression before feature PRs.
Frontend feature → `dev` has no duplicate GitHub Actions suite. The developer supplies an isolated
candidate checkout using current frontend `dev` and latest backend `dev` after dependencies merge.
Before feature merge, confirm the candidate/base, backend and Automation revisions still match the
QA report; any change requires renewed QA verification, not a reused pass.

GitHub Actions runs the full Playwright suite only for frontend `dev` → `test`, against backend
`test`, without an additional QA-agent run. Require that promotion's full regression and fresh
backend compatibility before merge; wait for backend test promotion and notifier completion.
Backend test pushes refresh only this frontend gate. Backend and Automation PRs do not run the
suite. Test → `main` runs no automated QA, full suite, smoke checks or backend compatibility gate;
backend main pushes do not refresh gates. Normal application deployment is unchanged.
When coverage changes, update both frontend workflow pins to the reviewed Automation commit.

- **FAILED — application bug:** the development agent fixes the app branch, verifies it, and
  repeats code review until clean before requesting QA again.
- **FAILED — test bug:** the QA agent fixes and reviews Automation tests, then reruns QA.
- **FAILED — infrastructure or unknown:** resolve the blocker and repeat the affected targeted checks.
- **PASSED:** attach the QA report, coverage matrix, tested refs, results, artifacts, and Automation
  PR link with the proof below. Required criteria cannot be skipped to obtain a pass.

Do not open a feature PR while QA is FAILED, blocked, missing, or stale. Any app/test change after
QA invalidates its pass. Before the feature PR exists, the Automation PR links real branch compare
URLs; after creating the feature PR, backfill its link in the Automation PR and card report.
Documentation-only criteria use executed static/contract checks with an explicit explanation;
never fabricate browser coverage. Automation test deliverables receive code review and real test
runs without recursively spawning QA. The initial canonical QA-agent definition can be reviewed
and published with static contract verification; its app rollout still requires the real QA run.

### 8. Attach Proof of Completion to the Task

Before the merge request exists, the task must be able to stand on its own as a record of the work.
Attach to the card:

- **Evidence that it works** — a screenshot of the tests passing, a screenshot of the UI in its
  intended state, the response of the endpoint you exercised, or the equivalent artifact for the kind
  of work you did.
- **The QA handoff** — PASSED report, criterion-to-test mapping, exact tested revisions, targeted
  and relevant unit-check results, sanitized artifacts, and the Automation PR (or justified unchanged
  existing coverage link).
- **A summary of what was implemented** — what changed, and how each requirement you read on the card
  is now met.

The proof comes from a real feedback loop, not from reading the diff. Anything you could not verify
must be stated explicitly on the card instead of implied.

**Never attach secrets.** Screenshots and pasted output must not expose keys, tokens, or credentials.

### 9. Open the Merge Request into `dev` and Link It Back

Only once the proof is on the card, open a **merge request from the task branch into `dev`** using
the **`gh` CLI**, with the task name as the title and the summary of what was implemented as the
body:

```bash
git push -u origin <task-name>
gh pr create --base dev --head <task-name> --title "<task-name>" --body "<what was implemented>"
```

Then take the URL the command prints — or read it back explicitly — and **paste the merge request
link onto the task**:

```bash
gh pr view --json url --jq .url
```

The card then holds the full story: what was asked, what was built, the proof it works, and where to
review it.

A task without its merge request link is not finished.

---

## Close the Feedback Loop — Prove It Works

Code is not "ready" because it _looks_ like it will work. Before you tell the user something is done,
you must **actually verify it works** with a real feedback loop. The right verification tool depends
on the context — pick from the options below and iterate until you have evidence, not a hunch.

**Golden rule:** run the loop yourself, observe the real output, and only then report success. If you
cannot verify, say so explicitly rather than implying it works.

### 1. New Endpoints → Test Autonomously With cURL

When you build or change an endpoint, exercise it yourself with `curl`, using everything you learned
about its route, method, payload, and auth while implementing it.

- **API-key endpoints:** read the required key from the repo's **`.env`** file and pass it in the
  expected header. **Never commit the key** (or any secret) anywhere — use it only for the live test.

Inspect the status code and body. Loop — adjust the code, re-run — until the response is correct.

### 2. Generic Functions → Unit Tests

For generic/pure functions, verify with **unit tests** via the existing **`unit-test` agent**. Let it
write and run the tests; use failures to drive fixes until green.

### 3. Complex Server Logic → Component Tests

For complex server functions (orchestration across services, guards, pipelines, DB interactions),
write **component tests** using the **`component-test` agent**, and iterate on the results.

### 4. Client-Side → Log In, Debug, and Drive Chrome DevTools MCP

Client debugging is the hardest and most important loop. Verify both that the **component lifecycle**
behaves and that the **rendered result** is correct.

#### Inspect with debugger statements + Chrome DevTools MCP

- Place `debugger;` statements at the points whose behavior you need to confirm.
- Drive the **Chrome DevTools MCP** to run the app, hit those breakpoints, **print/evaluate** state,
  read the **console**, and watch **network requests/responses**.
- Use what you observe to confirm the lifecycle and data flow — or to locate the defect.

### 5. UI Work → Require a Reference, Then Loop Until It Matches

If you are building or changing UI, you **must** have a concrete target to compare against. Ask the
user to supply one of:

- a **screenshot** of the desired design, **or**
- a **Figma link** (use the **Figma MCP** to read the frames/specs), **or**
- an **on-disk folder with reference HTML** that illustrates the intended result.

Then use the **Chrome DevTools MCP** to actually _see_ your rendered output, compare it to the
reference, and run a feedback loop — adjusting styles/markup and re-checking — **until the result
matches the reference.** Do not declare UI done from code inspection alone.

### 6. Hit a Bug? Use the Tools to Decide, Not to Guess

Whenever you run into a bug, reach for the tools above as your feedback loop — cURL for endpoints,
the unit-test/component-test agents for logic, and the Chrome DevTools MCP (with the automation login
and `debugger` statements) for the client. **Base the fix on the tool output**, making educated
decisions from real evidence rather than speculating.

### Secrets Discipline

Any key or token you use to test (from `.env`, the automation API key, minted user tokens) is for the
live verification loop only. **Never commit secrets** to source, config, logs, or anywhere in the
repo.

---

## Migrations — Document Every Schema and Environment Change

Server work that changes how the application is deployed or stored must leave a trace. If a task
touches the **database schema** — adding entities, changing columns, dropping tables — or requires a
**new environment variable**, that change is not finished when the code compiles: it must be
documented as a migration in the repository's `migrations` folder.

**Golden rule:** code changes describe how the app behaves; migrations describe what an operator has
to do to the database and the environment before that code can run. Never leave the second half
implicit.

### 1. When a Migration Is Required

Create a migration whenever the task involves any of the following:

- **Adding or removing entities** — new tables, dropped tables, join tables.
- **Changing columns** — adding, renaming, retyping, or removing a column; changing nullability,
  defaults, indexes, or constraints.
- **Adding environment variables** — any new key the server reads at runtime.

If the task only changes application logic and touches none of the above, no migration file is
needed.

### 2. One File per Migration, Named for Purpose and Date

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

### 3. Schema Changes → SQL Script **and** Updated ERD

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

### 4. Environment Variables → State What to Add and Why

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
</content>
