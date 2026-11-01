# Feature permissions

Account roles are labels and qualification categories. Authorization uses explicit
feature/action keys from `src/constants/authorization.constant.ts`, resolved from
`role_permissions` in the database. The supported catalog is stored in `permissions`.
No grant editor, grant-management HTTP endpoint, wildcard role bypass, per-user override,
policy-version table or authorization-audit table is included. Change grants through new
reviewed migrations. Do not edit an applied migration.

## Baseline and enforcement

The initial migration preserves the six existing roles and grants:

- Every role retains existing authenticated reads, Drive upload and access to its own session/password.
- Admin alone creates/deletes projects, manages customers/employees and creates/edits/assigns/deletes tasks or changes urgency.
- Admin, secretary and project manager edit projects, create apartments, move project status, look up addresses and provision/move/trash project Drive content.
- Engineer claims unassigned tasks; admin and engineer update task status. Existing status-update scope is retained, rather than silently limiting engineers to their own tasks.
- Drive connection and template mutation remain admin-only.

Each route declares `RequirePermissions`, `Authenticated` (self-service), or `Public`.
Unannotated routes, empty required-permission declarations and absent/unknown grants deny.
Multiple required permissions use all-of semantics. Login and each authenticated request
read current role grants; JWTs retain identity only. Database failures propagate and never
fall back to role-based access. The current-user response is an explicit public projection,
including effective permissions and excluding password hashes and ORM internals.

Task service methods recheck action permissions. Creating an assigned task or changing
`assigneeId` additionally requires `tasks.assign`; role changes in employee writes require
`employees.roles.assign`. Task assignees/claimants must still qualify as engineers.
Project team-slot qualification and personal task filtering remain independent business rules.
Feature read access includes existing linked-record context; this work does not introduce
project approval/visibility gating or a new field-level data-visibility policy.

The frontend consumes effective permissions, refreshes the authenticated account on restore,
focus and forbidden responses, and discards domain query caches on identity/permission changes.
Older stored sessions can restore their token but receive no assumed grants before verification.
The frontend catalog repeats key names for typing, not role grants; contract QA checks key parity.

## Migration and rollout

1. Review `migrations/20261025093708_add_feature_permissions.sql` and apply it to the intended environment before deploying the new backend.
2. The migration creates/seeds two new tables and leaves existing account/data rows unchanged. It enables RLS and revokes PUBLIC/anon/authenticated access. There are no browser grant-write policies.
3. Verify the backend database connection uses the intended trusted role. The current owner/postgres connection can read these tables. A non-owner/non-BYPASSRLS connection needs explicit SELECT grants and backend-role SELECT policies provisioned by the operator; never grant public client access to fix connectivity.
4. Verify all six roles' expected grants and login/current-user/API authorization in the target environment.
5. Deploy the backend first, then the companion frontend. Old frontend versions retain their role assumptions until updated, although backend decisions already use current DB grants. New frontend versions require the backend permission-bearing session response.
6. Before frontend merge/release, recheck the paired backend and Automation revisions and renew targeted QA if they changed. Standard full Playwright/compatibility runs belong only to frontend dev-to-test, not feature QA or test-to-main.

The new tables are additive: rollback application code can leave them in place. A code rollback
also restores old static role checks, so it cannot be used to preserve later customized grants.
No shared environment migration is applied as part of preparing these PRs.

## Module boundary

Permission and role-permission models are registered with the database provider. The read-only
RolePermission module exposes its service; its repository owns ORM queries. The permission
catalog is an internal schema entity, not a CRUD feature. No HTTP controller is intentionally
published for either table because permissions are migration-managed.
