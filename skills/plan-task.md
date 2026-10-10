# Trello Task

## Purpose

Turn any Trello card the user references into first a **reviewable implementation plan**, and then —
only if the user asks — a real implementation. The skill owns the full path: recognizing the
reference, bringing up Trello access with proper auth, gathering every scrap of card context,
resolving designs, learning the codebase, and producing the plan.

The plan is a Markdown file that includes:

- Technical approach
- Required code changes
- Dependencies
- Risks
- Open questions
- References to downloaded Figma assets (local only, not committed)

---

## When To Use

Trigger this skill **whenever the user references a Trello card**, even with no other instruction.
Recognize all forms:

- A full URL, e.g. `https://trello.com/c/AbCd1234/67-add-user-registration-endpoint`
- A short link, e.g. `AbCd1234`
- A card number on the board, e.g. `67`, `#67`, `card 67`, `task 67`

Pasting the link or the number **is** the request. Do not wait for the user to say "plan this" — go
straight to fetching context and producing the plan, then hand it back for review.

---

## Inputs

### Required

- `card` (string) — a full Trello card URL, a card short link, or a bare card number

### Optional

- `workspaceRoot` (string)
- `relatedRepos` (string[])

---

## Resolve Board and Card

Parse these values before touching the API:

- **Board** — the board the card belongs to. Default board is
  [Team's Goals](https://trello.com/b/0YGKf1tR/teams-goals), board short link `0YGKf1tR`.
- **Card short link** — the segment after `/c/` in a card URL (e.g. `AbCd1234`). This is the value
  every Trello endpoint accepts as the card ID.
- **Card number** — the number in the URL slug (e.g. `67` in `/c/AbCd1234/67-add-user-...`).

When the user supplies only a card number, resolve it against the default board by listing the
board's cards and matching `idShort`. When the URL points at a different board than the default, use
the board from the URL — never override what the URL states.

---

## Bring Up Trello Access (with auth)

Before fetching anything, make sure Trello is reachable and authenticated for the resolved board.

1. **Load the Trello tools.** Use `tool_search` for Trello tools — they are deferred. If a Trello MCP
   server resolves and responds, use it and skip to fetching.
2. **Fall back to the Trello REST API.** If no Trello MCP is available, call the REST API directly
   with `curl`. Every request needs a key and a token:

   ```bash
   curl -s "https://api.trello.com/1/cards/$CARD?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN"
   ```

3. **Authenticate with read AND write permissions.** The credentials come from the user's own Trello
   account:
   - API key from <https://trello.com/power-ups/admin> (Power-Up → API key).
   - Token generated from that key with **`read,write`** scope and the board's workspace authorized.

   Confirm the scope covers both — the user may later ask to update the card (comment, move list,
   attach proof), which fails on a read-only token. If a call returns `401` or `invalid token`,
   have the user regenerate the token rather than guessing.

   **Never print, echo, or write the key or token into any file, plan, or commit.** Read them from
   the environment only.

If Trello cannot be reached or authenticated, **stop and tell the user** — do not fabricate card
content.

---

## High-Level Flow

### 1. Fetch Card Context

Retrieve, for the resolved board and card:

- **Title** (`name`)
- **Description** (`desc`)
- **Acceptance criteria** — the card's **checklists** and every check item
- **Comments** — read every one, requirements often live only there
- **Linked cards** — attachments whose URL points at another Trello card
- **Attachments** — download and inspect images/specs, not just their names
- **Labels, due date, members, current list** — scope, area, and where the card sits in the flow

```bash
# Card with everything attached to it in one call
curl -s "https://api.trello.com/1/cards/$CARD?attachments=true&checklists=all&checkItemStates=true&members=true&list=true&board=true&key=$TRELLO_API_KEY&token=$TRELLO_TOKEN"

# Comments, newest first
curl -s "https://api.trello.com/1/cards/$CARD/actions?filter=commentCard&limit=100&key=$TRELLO_API_KEY&token=$TRELLO_TOKEN"
```

Attachments uploaded to Trello are private — download them with an OAuth header, not a query string:

```bash
curl -sL -H "Authorization: OAuth oauth_consumer_key=\"$TRELLO_API_KEY\", oauth_token=\"$TRELLO_TOKEN\"" \
  "$ATTACHMENT_URL" -o "/tmp/plan-task/$CARD/attachments/$FILENAME"
```

### 2. Extract External References

- Detect Figma URLs
- Detect API specs / docs links
- Detect related repo mentions
- Detect links to other Trello cards, and read those cards too

If no Figma links found but UI work is implied → ASK USER

---

### 3. Resolve Figma Designs

Download relevant frames/screens into:

```
/tmp/plan-task/<card-short-link>/figma/
```

---

### 4. Learn the Codebase FIRST

- Identify tech stack
- Identify architecture patterns
- Find similar implementations

---

### 5. Gap Analysis

Compare requirements, designs, and codebase.

---

### 6. Multi-Repo Detection

Ask user before proceeding if more repos are needed.

---

### 7. Question Gate

Stop and ask questions if anything is unclear. Ask **while the card is still in the backlog** — the
active list means "being worked on right now", not "being figured out".

---

### 8. Output the Plan

```
/tmp/plan-task/<card-short-link>/implementation-plan.md
```

Present the plan and hand it back for review. Do **not** start writing code yet, and do **not** move
the card yet.

---

### 9. Implement Only On Request

If — and only if — the user says to implement (before or after seeing the plan), execute the work
**according to their instructions and the agreed plan**, following
[development-workflow-standards.md](../rules/development-workflow-standards.md):

- Move the card to the **active list** before writing any code.
- Branch from the latest `dev`, named after the card.
- Follow the plan's proposed changes and the repository's coding standards.
- Reuse existing patterns and shared packages instead of reinventing them.
- Verify the change with a real feedback loop before declaring it done.
- Attach the proof of completion and the merge request link back to the card.
- Never commit or push on your own — leave the changes for the user to review and commit.

Card updates use the write scope of the token:

```bash
# Move the card to another list
curl -s -X PUT "https://api.trello.com/1/cards/$CARD?idList=$LIST_ID&key=$TRELLO_API_KEY&token=$TRELLO_TOKEN"

# Comment the summary of what was implemented
curl -s -X POST "https://api.trello.com/1/cards/$CARD/actions/comments?text=$SUMMARY&key=$TRELLO_API_KEY&token=$TRELLO_TOKEN"

# Attach the merge request link
curl -s -X POST "https://api.trello.com/1/cards/$CARD/attachments?url=$MR_URL&key=$TRELLO_API_KEY&token=$TRELLO_TOKEN"
```

If the user's implementation instructions conflict with the plan, the user's instructions win — but
surface the conflict instead of silently diverging.

---

## Output Format

```markdown
# Implementation Plan: <Card Title>

## 1. Summary

## 2. Requirements Breakdown

## 3. Design References

## 4. Current State Analysis

## 5. Proposed Changes

## 6. Cross-Repo Changes

## 7. Risks & Edge Cases

## 8. Open Questions

## 9. Implementation Steps

## 10. Definition of Done
```

---

## Behavioral Rules

### NEVER

- Guess missing requirements
- Invent APIs
- Assume repo structure
- Expose the Trello key or token

### ALWAYS

- Ask when uncertain
- Reuse existing patterns
- Reference real files

---

## Failure Modes

- Stop if Trello cannot be reached or authenticated — tell the user, do not fabricate
- Stop on any API or MCP failure
- Do not continue with partial data

---

## Notes

- Accuracy over completeness
- Plans must be reviewable by senior engineers
