BEGIN;

INSERT INTO permissions (key, feature, action)
VALUES ('quotations.delete', 'quotations', 'delete')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role, permission_key)
VALUES ('system_admin', 'quotations.delete')
ON CONFLICT (role, permission_key) DO NOTHING;

COMMIT;
