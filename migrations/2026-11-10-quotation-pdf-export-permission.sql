-- PDF export creates a project Drive file; grant it to engineers and administrators.
INSERT INTO permissions(key, feature, action)
VALUES ('quotations.export', 'quotations', 'export')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions(role, permission_key)
VALUES ('engineer', 'quotations.export'), ('system_admin', 'quotations.export')
ON CONFLICT DO NOTHING;
