BEGIN;

LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  role user_role NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_user_roles_user_id_role
  ON user_roles (user_id, role);
CREATE INDEX idx_user_roles_user_id ON user_roles (user_id);
CREATE INDEX idx_user_roles_role_user_id ON user_roles (role, user_id);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON user_roles FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON user_roles FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON user_roles FROM authenticated;
  END IF;
END $$;

INSERT INTO user_roles (user_id, role)
SELECT id, role
FROM users;

CREATE FUNCTION synchronize_legacy_user_role_assignment() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Old servers keep single-role behavior; new mutations opt out transaction-locally.
  IF current_setting('genair.role_membership_managed', true) IS DISTINCT FROM 'true' THEN
    DELETE FROM user_roles
    WHERE user_id = NEW.id;

    INSERT INTO user_roles (user_id, role)
    VALUES (NEW.id, NEW.role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_sync_legacy_role_assignment
AFTER INSERT OR UPDATE OF role ON users
FOR EACH ROW EXECUTE FUNCTION synchronize_legacy_user_role_assignment();

CREATE TABLE user_role_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES users(id),
  actor_role user_role NOT NULL,
  subject_user_id uuid NOT NULL REFERENCES users(id),
  action varchar(20) NOT NULL CHECK (action IN ('assignment', 'switch')),
  previous_role user_role,
  next_role user_role,
  previous_assigned_roles jsonb NOT NULL,
  next_assigned_roles jsonb NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_role_audits_subject_created
  ON user_role_audits (subject_user_id, created_at);
CREATE INDEX idx_user_role_audits_actor_created
  ON user_role_audits (actor_id, created_at);

ALTER TABLE user_role_audits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON user_role_audits FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON user_role_audits FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON user_role_audits FROM authenticated;
  END IF;
END $$;

ALTER TABLE task_status_transitions
  ADD COLUMN changed_by_role user_role;

SELECT COUNT(*) AS users_missing_assigned_roles
FROM users
WHERE NOT EXISTS (
  SELECT 1
  FROM user_roles
  WHERE user_roles.user_id = users.id
    AND user_roles.role = users.role
);

SELECT COUNT(*) AS task_transitions_with_unverified_role_snapshot
FROM task_status_transitions
WHERE changed_by_role IS NOT NULL;

SELECT action, COUNT(*) AS audit_rows
FROM user_role_audits
GROUP BY action
ORDER BY action;

-- Review all verification results before applying.
-- COMMIT;
