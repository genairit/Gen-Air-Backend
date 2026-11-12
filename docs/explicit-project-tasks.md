# Explicit project tasks

As of task #147, creating a standalone project, building, apartment, or an apartment through Excel import does not create quotation or planning tasks. The project-created event still provisions its other resources, including Drive folders. Existing task rows, status transitions, assignees, and history remain unchanged.

An authorized user creates a task through `POST /task` with a project ID and `taskType` of `general`, `quotation`, or `planning`. If omitted, `taskType` defaults to `general`. The server requires `tasks.create`, and assignment additionally requires `tasks.assign`. A protected type (quotation or planning) occupies one lifetime slot for its project, enforced by the existing `uq_tasks_project_protected_type` database index, including completed and soft-deleted rows. Concurrent or repeat attempts return conflict. Protected tasks retain their existing no-delete, no-relink, and no-type-change rules. General tasks remain unrestricted by the protected slot.

`GET /task/project/:projectId/protected` requires `tasks.create` and returns the exact occupied protected slots (ID, type and availability), independent of task-list pagination. It lets the project card open an existing task and the form block a duplicate before submission. The create endpoint remains the final authority for concurrent requests.

The task form is an explicit entry point from a project's or apartment's task card and from the Tasks page. The latter requires a project choice before save. Creating or editing a quotation or planning document does not create a task. Bidirectional document navigation and task/document cardinality are tracked separately in task #131.

No schema migration or data backfill is required for this change. To roll back application behavior, restore the prior application revisions without changing existing task records or the protected uniqueness index; doing so would re-enable automatic task creation for future projects.
