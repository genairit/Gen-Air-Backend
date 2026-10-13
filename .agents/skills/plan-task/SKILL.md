---
name: plan-task
description: Turn a referenced Trello card URL, short link, or card number into a reviewable implementation plan; implement it only when the user requests implementation.
---

# Plan a Trello task

Read the canonical [planning workflow](../../../skills/plan-task.md) before
fetching card context. It defines the default board, card resolution, full context
collection, design references, gap analysis, and implementation-plan structure.
Also follow the repository's [Codex guidance](../../../AGENTS.md).

## Codex execution

- Resolve a bare card number against Team's Goals (`0YGKf1tR`); preserve a board
  explicitly identified by the supplied card.
- Use available Trello tools first. If unavailable, use authenticated REST access
  with credentials from the environment, keeping keys and tokens out of output.
  If authentication or required context cannot be obtained, report the blocker.
- Read descriptions, checklists, comments, attachments, and linked cards before
  planning. Use available Figma or browser tools for designs; obtain a concrete
  reference when UI work needs one. Never fabricate missing requirements.
- Inspect the actual repositories and existing patterns. Ask about additional
  repositories only when they are outside the user's already authorized scope.
- Save the reviewable plan and downloaded design references in a temporary
  directory outside version control; use the current platform's temp location
  instead of assuming `/tmp` exists.
- A card reference alone requests a plan. If implementation is requested, proceed
  within that authorization and the shared development workflow. Commit, push,
  and create a pull request when the user requests them; otherwise leave the
  changes for review. Update the card only when authorized by the user or the
  explicitly invoked workflow.
- Use available equivalents for tool names in the canonical workflow. Explain
  incomplete verification or missing card context instead of implying success.
