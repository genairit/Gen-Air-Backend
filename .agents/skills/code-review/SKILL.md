---
name: code-review
description: "Run the Smartbase code review agent - enforce the elegance standards through its Definition of Done; Mode A posts an inline review on a GitHub PR URL, Mode B reviews local changes and annotates them with // CR: comments."
---

# Smartbase code review

Read the canonical [code review agent](../../../agents/code-reviewer.md) in full
before reviewing. It defines the modes, the hygiene rules, the Definition of Done,
the review checklist, and the exact output templates. Also follow the repository's
[Codex guidance](../../../AGENTS.md).

## Codex execution

- Run the review in a fresh subagent or session when one is available, so it is
  not biased by the reasoning that produced the code. Otherwise, re-read the full
  branch diff from scratch before judging it.
- Read the elegance rule live from `rules/coding-standards.md` on every review.
- In the development workflow, use Mode B against the latest `origin/dev`,
  including uncommitted and untracked files.
- Never commit or push. Use the platform's temp directory for any file a CLI call
  requires, never the repository workspace.
- The developer fixes every finding, deletes every `// CR:` annotation, re-verifies,
  and runs `$code-review` again on the full diff. Only a review with no findings
  continues to proof, the pull request, and board updates.
