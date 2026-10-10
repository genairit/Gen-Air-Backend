# Development Workflow — From Board Task to Merge Request

Every piece of work starts on the board and ends on the board. A task is not "in progress" because
someone is typing, and it is not "done" because the code compiles — the board must reflect reality at
each step, and the task itself must carry the evidence that the work was finished.

**Board:** [Team's Goals](https://trello.com/b/0YGKf1tR/teams-goals)

**Golden rule:** never touch code before the task is understood and moved to the active list and a
branch exists for it, and never open a merge request before the proof of completion is attached to
the task.

---

## 1. The Flow

The steps below are ordered and mandatory. Do not skip a step, and do not reorder them.

1. **Take the task** — the user gives the link to the task on the board.
2. **Read the task and understand its requirements** from that link.
3. **Move it to the active list** on the board, so the board shows who is working on what.
4. **Branch from `dev`** using the task's name.
5. **Implement the task** on that branch.
6. **Attach proof of completion** to the task — evidence plus a summary of what was implemented.
7. **Open a merge request** from the branch into `dev`.
8. **Attach the merge request link** to the task.

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

If the task is still unclear, resolve it with the user *before* moving it — the active list means
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
always be traced back to the card it belongs to.

```
add-user-registration-endpoint
fix-dashboard-filter-reset
```

## 5. Implement the Task on That Branch

Write the code for that task and that task only. Work that is not part of the card belongs to a
different card and a different branch.

The other standards in this folder apply here as usual — coding standards, migrations, and the
feedback loops that prove the change actually works.

## 6. Attach Proof of Completion to the Task

Before the merge request exists, the task must be able to stand on its own as a record of the work.
Attach to the card:

- **Evidence that it works** — a screenshot of the tests passing, a screenshot of the UI in its
  intended state, the response of the endpoint you exercised, or the equivalent artifact for the kind
  of work you did.
- **A summary of what was implemented** — what changed, and how each requirement you read on the card
  is now met.

The proof comes from a real feedback loop, not from reading the diff. Anything you could not verify
must be stated explicitly on the card instead of implied.

**Never attach secrets.** Screenshots and pasted output must not expose keys, tokens, or credentials.

## 7. Open the Merge Request into `dev` and Link It Back

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
