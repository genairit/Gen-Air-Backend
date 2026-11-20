-- Apply after 2026-11-13-execution-plan-review.sql. The lead role already exists.
BEGIN;

INSERT INTO role_permissions (role, permission_key)
SELECT 'engineering_lead', permission_key
FROM role_permissions
WHERE role = 'engineer'
ON CONFLICT (role, permission_key) DO NOTHING;

INSERT INTO role_permissions (role, permission_key)
VALUES ('engineering_lead', 'quotations.approve')
ON CONFLICT (role, permission_key) DO NOTHING;

COMMIT;
