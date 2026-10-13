---
name: entity-module
description: Create, extend, review, or refactor NestJS and Sequelize server entity modules, including controllers, services, repositories, entities, DTOs, and layer placement. Use for backend work, including explicitly authorized cross-repository backend changes.
---

# Build a server entity module

Read the canonical [entity-module workflow](../../../skills/entity-module.md)
before implementation or review. Follow its folder layout, layer boundaries,
naming, validation, transactions, authorization, cursor pagination, and module
and model registration requirements. Also follow the repository's
[Codex guidance](../../../AGENTS.md).

- Inspect the actual server module and database provider before changing them.
  Preserve the repository's decorators, contracts, and path aliases; examples
  in the workflow must be mapped to the real code rather than copied blindly.
- Keep HTTP concerns in controllers, business rules in services, ORM queries in
  repositories, and declarative schema definitions in entities.
- Document schema changes with a new migration and an updated ERD; document new
  environment variables without exposing secrets.
- Verify changed behavior with available endpoint, unit, or component tools.
  The shared testing-agent names do not imply configured Codex subagent roles.
- In a frontend repository, this skill applies only when backend work is within
  the user's authorized scope. It does not prescribe NestJS layers for React.
