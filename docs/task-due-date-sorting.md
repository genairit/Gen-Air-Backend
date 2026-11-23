# My Tasks ordering

`GET /task/my-tasks` accepts the optional closed `sort` query parameter. The authenticated
user's ID remains authoritative for assignment scope, including when a different `assigneeId`
is supplied. Existing status, search, project/customer and urgency filters remain independent
of ordering.

| Sort                 | SQL order before pagination                                               |
| -------------------- | ------------------------------------------------------------------------- |
| omitted or `default` | urgency descending, due date ascending with nulls last, task ID ascending |
| `due_date_asc`       | due date ascending with nulls last, task ID ascending                     |
| `due_date_desc`      | due date descending with nulls last, task ID ascending                    |

Explicit date ordering does not group urgent tasks first. Urgency remains visible and filterable.
Overdue tasks are earlier timestamps, without another priority bucket: they come before later
values in ascending order and after later values in descending order. Undated tasks are always
last. Stable task-ID ties apply to identical timestamp values and to the null-date group.

## Cursor contract

A returned `nextCursor` is unpadded canonical base64url JSON with `id`, `isUrgent`, `dueDate`
(canonical ISO timestamp or null), and `sort`. The urgency position is retained for compatibility,
but date-order predicates ignore it. Continue a query using the same filters and sort. Invalid,
malformed, unknown-sort or sort-mismatched cursors return HTTP 400 rather than restarting page one.
A legacy task cursor without the `sort` tag is accepted only with the default order. The generic
created-at cursor contract is unchanged.

All rows are sorted in SQL before applying the cursor and page limit. The client starts a separate
page chain for each sort/filter combination; it does not sort only the loaded page. The selected
sort remains state of the mounted task table, matching existing search/tab behavior; remounting
restores the current urgent-first default.

## Date semantics

Ordering compares the exact stored `DATE(3)` timestamp. There is no truncation, timezone conversion,
or rewrite of existing values. Date-only input is currently parsed as midnight UTC; chronological
sorting preserves that existing behavior. Equal displayed calendar dates can contain different
stored instants, so the task ID is a tie-breaker only after exact timestamp equality.

Existing backend overdue validation uses `Asia/Jerusalem`; current client date/overdue presentation
uses the browser's local moment timezone. This feature does not claim to unify those existing
presentation semantics or introduce a date migration. No database schema, index or environment
change is required.
