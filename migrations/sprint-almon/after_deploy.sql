BEGIN;

CREATE FUNCTION enforce_user_role_assignment() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  affected_user_id uuid;
BEGIN
  affected_user_id := COALESCE(NEW.user_id, OLD.user_id);

  IF EXISTS (
    SELECT 1
    FROM users
    WHERE id = affected_user_id
      AND deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM user_roles
        WHERE user_id = affected_user_id
          AND role = users.role
      )
  ) THEN
    RAISE EXCEPTION 'Every active user must have their active role assigned';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_user_roles_preserve_active_role
AFTER INSERT OR UPDATE OR DELETE ON user_roles
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_user_role_assignment();

CREATE FUNCTION enforce_user_active_role_assignment() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  affected_user_id uuid;
BEGIN
  affected_user_id := COALESCE(NEW.id, OLD.id);

  IF EXISTS (
    SELECT 1
    FROM users
    WHERE id = affected_user_id
      AND deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM user_roles
        WHERE user_id = affected_user_id
          AND role = users.role
      )
  ) THEN
    RAISE EXCEPTION 'Every active user must have their active role assigned';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_users_preserve_active_role
AFTER INSERT OR UPDATE OF role, deleted_at ON users
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_user_active_role_assignment();

SELECT COUNT(*) AS active_users_missing_active_role_assignment
FROM users
WHERE deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM user_roles
    WHERE user_roles.user_id = users.id
      AND user_roles.role = users.role
  );

SELECT action, COUNT(*) AS audit_rows
FROM user_role_audits
GROUP BY action
ORDER BY action;

SELECT COUNT(*) AS historical_transitions_without_role_snapshot
FROM task_status_transitions
WHERE changed_by_role IS NULL;

-- Review all verification results before applying.
-- COMMIT;
