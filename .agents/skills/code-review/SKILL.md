---
name: code-review
description: Review a task branch's changes against dev, the Trello card's requirements, and the repository rules before proof and the pull request; report NO NOTES or a numbered list of required fixes without editing code.
---

# Review a task branch

Read the canonical [code reviewer](../../../agents/code-reviewer.md) before
reviewing. It defines the inputs, the review flow, the checks against the card and
`rules/`, and the exact output format. Also follow the repository's
[Codex guidance](../../../AGENTS.md).

## Codex execution

- Run the review in a fresh subagent or session when one is available, so it is
  not biased by the reasoning that produced the code. Otherwise, re-read the full
  branch diff from scratch before judging it.
- Review against the latest `origin/dev`, including uncommitted and untracked
  files.
- The reviewer only reports. It never edits, stages, commits, or pushes.
- Report `NO NOTES` or `NOTES` with numbered `file:line` required fixes, exactly
  as the canonical output format defines.
- The developer fixes every note, re-verifies, and runs `$code-review` again on
  the full diff. Only a `NO NOTES` result continues to proof, the pull request,
  and board updates.
