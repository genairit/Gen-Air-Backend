GenAir execution policy: [genair-automatic-qa-policy.md](genair-automatic-qa-policy.md) overrides automatic browser-run requirements below.

# Development Workflow — From Board Task to Merge Request

Every piece of work starts on the board and ends on the board. A task is not "in progress" because
someone is typing, and it is not "done" because the code compiles — the board must reflect reality at
each step, and the task itself must carry the evidence that the work was finished.

**Board:** [Team's Goals](https://trello.com/b/0YGKf1tR/teams-goals)

**Golden rule:** never touch code before the task is understood and moved to the active list and a
branch exists for it, and never open a merge request before the code review agent reports no findings
and the QA agent reports PASSED, with its report and the proof of completion attached to the task.

---

## 1. The Flow

The steps below are ordered and mandatory. Do not skip a step, and do not reorder them.

1. **Take the task** — the user gives the link to the task on the board.
2. **Read the task and understand its requirements** from that link.
3. **Move it to the active list** on the board, so the board shows who is working on what.
4. **Branch from `dev`** using the task's name.
5. **Implement the task** on that branch.
6. **Review the changes with the code review agent** — fix every finding it reports, delete its
   `// CR:` annotations, and review again until it reports none.
7. **Run the [QA agent](../agents/qa-agent.md)** against the exact feature revisions; fix failures
   through the responsible agent and repeat until it reports **PASSED**.
8. **Attach proof of completion** to the task — evidence plus a summary of what was implemented.
9. **Open a merge request** from the branch into `dev`.
10. **Attach the merge request link** to the task.

## 2. Open the Link and Understand the Task First

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

## 3. Move the Task to the Active List

Once the task is understood, move it into the **active list** on the board. This happens **before any
code is written**, so the board never shows work sitting in the backlog while it is actually being
built.

If the task is still unclear, resolve it with the user _before_ moving it — the active list means
"being worked on right now", not "being figured out".

## 4. Create a Branch from `dev`, Named for the Task

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

## 5. Implement the Task on That Branch

Write the code for that task and that task only. Work that is not part of the card belongs to a
different card and a different branch.

The other standards in this folder apply here as usual — coding standards, migrations, and the
feedback loops that prove the change actually works.

## 6. Review the Changes With the Code Review Agent

When the implementation is finished and verified, run the [code review agent](../agents/code-reviewer.md) on
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

## 7. Run the QA Agent and Resolve Its Results

After code review reports no findings, invoke the [QA agent](../agents/qa-agent.md) in a fresh
context with the card, both app feature refs and diffs, clean review result, and Automation repo.
It maintains Playwright coverage in Gen-Air-Automation, runs targeted and full regression against
those exact revisions, opens the Automation PR, and returns the structured PASSED/FAILED report.

- **FAILED — application bug:** the development agent fixes the app branch, verifies it, and
  repeats code review until clean before requesting QA again.
- **FAILED — test bug:** the QA agent fixes and reviews Automation tests, then reruns QA.
- **FAILED — infrastructure or unknown:** resolve the blocker and repeat the complete run.
- **PASSED:** attach the QA report, coverage matrix, tested refs, results, artifacts, and Automation
  PR link with the proof below. Required criteria cannot be skipped to obtain a pass.

Do not open a feature PR while QA is FAILED, blocked, missing, or stale. Any app/test change after
QA invalidates its pass. Before the feature PR exists, the Automation PR links real branch compare
URLs; after creating the feature PR, backfill its link in the Automation PR and card report.
Documentation-only criteria use executed static/contract checks with an explicit explanation;
never fabricate browser coverage. Automation test deliverables receive code review and real test
runs without recursively spawning QA. The initial canonical QA-agent definition can be reviewed
and published with static contract verification; its app rollout still requires the real QA run.

## 8. Attach Proof of Completion to the Task

Before the merge request exists, the task must be able to stand on its own as a record of the work.
Attach to the card:

- **Evidence that it works** — a screenshot of the tests passing, a screenshot of the UI in its
  intended state, the response of the endpoint you exercised, or the equivalent artifact for the kind
  of work you did.
- **The QA handoff** — PASSED report, criterion-to-test mapping, exact tested revisions, targeted
  and full regression results, sanitized artifacts, and the Automation PR (or justified unchanged
  existing coverage link).
- **A summary of what was implemented** — what changed, and how each requirement you read on the card
  is now met.

The proof comes from a real feedback loop, not from reading the diff. Anything you could not verify
must be stated explicitly on the card instead of implied.

**Never attach secrets.** Screenshots and pasted output must not expose keys, tokens, or credentials.

## 9. Open the Merge Request into `dev` and Link It Back

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
