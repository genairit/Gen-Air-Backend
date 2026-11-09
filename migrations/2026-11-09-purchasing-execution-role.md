# Purchasing and execution manager role

Apply `2026-11-09-add-purchasing-execution-manager-role.sql` first and commit it. Then apply `2026-11-09-seed-purchasing-execution-permissions.sql`. PostgreSQL requires the new enum value to be committed before it is inserted into `role_permissions`. Both files are idempotent. Neither assigns the role to an account or changes existing user roles. Verify the eight catalog keys, the twelve new-role grants, finance and admin payment grants, and zero unexpected `user_roles` assignments before deploying matching application code.

| Action | Manager | Finance | Admin |
| --- | --- | --- | --- |
| BOQ/template maintenance | Yes | No | Yes |
| Supplier agreements | Yes | No | Yes |
| Purchase request review | Yes | No | Yes |
| Purchase order approval and sending | Yes | No | Yes |
| Execution handoff | Yes | No | Yes |
| Subcontractor settlement approval | No | Yes | Yes |
| Payment recording | No | Yes | Yes |

The manager also receives read access to projects, customers, tasks, employees, Drive, and quotations. These keys define the authorization contract for future purchasing, handoff, settlement, and payment endpoints. Those endpoints and object-scope checks do not exist yet; each future action must check its dedicated key and project scope server-side. The present release enables account assignment, filtering, active-role switching, and read access through existing guards. Admins must explicitly assign the role to chosen staff after the migration and deployment.

Rollback before assignments can delete only the inserted role grants and permissions; PostgreSQL enum values remain. After assignments, first revoke or migrate those assignments and active roles. Do not remove existing grants or historical user rows.
