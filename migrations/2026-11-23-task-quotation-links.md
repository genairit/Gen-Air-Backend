# Task quotation links

Apply `2026-11-23-task-quotation-links.sql` before deploying this feature. No new environment variables. Do not backfill by matching projects: only deliberate creation and brand cloning create associations.

The backend owns this table. RLS is enabled and public Data API roles have no access. Task and quotation soft deletion preserve historical rows; hard deletion is restricted. One primary association exists per task; an explicit create/open operation reuses the live primary, otherwise promotes a live secondary or creates a new draft atomically. Deleted quotation links remain historical.

GET `/task/:id/quotations` requires task and quotation read permissions. Existing readable links remain available without customer/project read; protected context IDs are omitted and creation is disabled. POST `/task/:id/quotation` returns HTTP 200 `{ quotationId, created }`; opening an existing target needs read permissions, creating also needs quotation create. No task update/status permission is required. Direct project customer is authoritative; legacy customer-only tasks are supported. Existing readable targets also remain openable after customer/project soft deletion; only creating a new draft requires live context. All normal draft initialization and optional sales-agent validation use the same transaction as its association.

Quotation detail includes `taskContextLocked` (customer locked), `taskProjectLocked` (project also locked), and readable `taskLinks`. Actors without task read receive no task names or IDs. Brand clones derive associations from the source and create secondary links.

The trigger function fixes its search path and reports the named `task_quotation_context_consistency` check; the HTTP boundary translates only that PostgreSQL check violation to409 `TASK_QUOTATION_CONTEXT_LOCKED`, keeping SQL details private. Deferred database constraints preserve linked context across quotation saves, primary project relinking, task changes and project customer changes. They retain deleted tasks' financial document context. Normal unlinked quotations are unaffected. Planning and manual file workflows remain outside this feature.
