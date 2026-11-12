-- Apply and commit before the permission seed: PostgreSQL cannot use a new
-- enum value in role_permissions until the ALTER TYPE transaction has committed.
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'purchasing_execution_manager';
