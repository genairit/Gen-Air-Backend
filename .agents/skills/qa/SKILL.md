---
name: qa
description: 'Run feature QA in Gen-Air-Automation after clean code review; return a structured PASSED/FAILED report before proof and feature PRs.'
---

# Feature QA

Read the canonical [QA agent](../../../agents/qa-agent.md) in full and follow
[Codex repository guidance](../../../AGENTS.md). This adapter does not duplicate its contract.

- Invoke the QA agent in a fresh subagent/session when available, supplying the card context,
  backend/frontend branches and exact refs/diffs, clean code review result, and Automation path.
- QA reads app repositories but changes only Gen-Air-Automation. Use available GitHub/Trello
  connectors or CLI equivalents; missing tools or credentials must be reported as FAILED.
- Follow the canonical phase-specific coverage, isolation, test review, failure ownership and
  report requirements. Local checks precede PR publication; automatic full regression belongs
  only to eligible frontend release PRs. Record pending integration explicitly. Never invent a pass.
- Return the structured report to the development agent. That agent fixes application bugs,
  repeats code review, and reruns QA; QA fixes test bugs in Automation. No feature proof/PR
  proceeds until PASSED against unchanged revisions. Backfill feature PR links after creation.
