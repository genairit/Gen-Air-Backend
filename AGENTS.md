# Codex repository guidance

The shared standards and workflows originate in Spec-Development-Component
(commit `895b8ba14239de6d96ef3365ec5d73605ad4c7ce`). `rules/`, `skills/`, and
`agents/` are the canonical source; this file and `.agents/skills/` adapt them for
Codex.

## Shared rules

Read these rules before implementation or review, applying stack-specific sections
only to the relevant code:

- [Coding standards](rules/coding-standards.md): pyramid ordering, naming, layer
  boundaries, declarative code, and formatting.
- [Development workflow](rules/development-workflow-standards.md): understand the
  task, branch from the latest `dev`, verify, pass code review and QA, and open a pull
  request into `dev`.
- [Feedback loops](rules/feedback-loops.md): prove behavior with the appropriate
  endpoint, unit, component, or browser checks and keep secrets out of artifacts.
- [Migrations](rules/migrations-standards.md): document schema and environment
  changes and keep the ERD consistent with schema migrations.

## Skills

- `$plan-task`: read `.agents/skills/plan-task/SKILL.md` for Trello card planning
  and implementation when requested.
- `$entity-module`: read `.agents/skills/entity-module/SKILL.md` for NestJS server
  entity modules. In frontend work, use it only for an authorized backend change.
- `$code-review`: read `.agents/skills/code-review/SKILL.md` to run the canonical
  [code review agent](agents/code-reviewer.md) on a PR or local changes.

- `$qa`: read `.agents/skills/qa/SKILL.md` for the feature QA agent and its structured
  handoff from Gen-Air-Automation.

## Code review and QA gates

When implementation is verified, run `$code-review` in Mode B; fix every finding and
remove its annotations, then obtain clean review before invoking `$qa` in a fresh context.
QA maintains Automation coverage and returns scoped results against exact revisions. Relevant
local unit/contract/type checks must pass before feature PR publication; report integration as
PENDING until the eligible frontend release gate runs. Application fixes require another clean
review; test fixes belong to QA. Failed, blocked, missing or stale local QA blocks feature PRs.

Run automatic full Playwright only through frontend feature → `dev`, `dev` → `test`, and
`test` → `main` PRs, against the matching destination backend branch after dependencies merge.
Backend and Automation PRs receive local checks and maintained coverage without browser runs.
Frontend merge requires full regression and fresh backend compatibility. Attach scoped QA and
CI evidence to the card/PRs, record immutable revisions, and backfill feature links. Follow the
existing [QA agent](agents/qa-agent.md) and [workflow](rules/development-workflow-standards.md).

## Codex adaptations

- User instructions and existing authorization take precedence over these shared
  workflows. A direct repository task can proceed without inventing a Trello card;
  apply board steps when a card is supplied and its updates are authorized.
- Planning alone does not authorize implementation. An explicit implementation or
  pull request request does authorize the corresponding work, including commits
  and pushes when needed to create the requested pull request.
- Use available connected tools or the GitHub CLI. Shared references to
  `tool_search`, Chrome DevTools MCP, Figma MCP, `unit-test`, or `component-test`
  describe capabilities, not guaranteed installed tools or agent definitions.
  Use an available equivalent; report any verification that remains blocked.
- Keep downloaded references and draft plans in a platform-appropriate temporary
  directory outside version control. Never commit `.env` files or credentials.
- Update these entry points when their canonical rules, skills, or agents change.
  Preserve existing Claude and Copilot integrations.
