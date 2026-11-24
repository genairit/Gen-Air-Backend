# Fixed project contact slots

Apply `2026-11-23-project-contact-role-slots.sql` before deploying the new project-contact API.
It adds a partial unique index to the existing relation; no new project columns, contact copies,
role grants or environment variables are required. Existing free-text roles stay unchanged.

## Preflight

Inspect any duplicates of the exact reserved role values before applying:

```sql
SELECT project_id, role, count(*)
FROM public.project_contact_links
WHERE role IN ('architect', 'project_manager', 'consultant')
GROUP BY project_id, role HAVING count(*) > 1;
```

Resolve duplicates explicitly with the project owner rather than arbitrarily promoting/removing
existing contacts. A conflicting migration fails atomically without data changes.

## Behavior and verification

`PUT /project/:projectId/contacts/roles/:role` accepts `{ "contactId": "UUID" }` or
`{ "contactId": null }`. The three stable values are `architect`, `project_manager`, `consultant`.
It requires project-update permission. Assignment/replacement/clear runs under a project row lock.
A displaced contact stays linked as an additional contact and retains its primary-contact flag.
A contact cannot fill two named slots on the same project; return 409 rather than silently moving it.
Project and apartment creation validate duplicate role assignments before inserting their contact links.

Verify assignment, reload, replacement, clear, preserved directory/primary links and 409 conflicts.
Only apply to development as part of this task; test/production await normal promotion.

## Rollback

Rollback application code first if necessary, then `DROP INDEX IF EXISTS public.uq_project_contact_role_slot;`.
No data rollback or reclassification is required.
