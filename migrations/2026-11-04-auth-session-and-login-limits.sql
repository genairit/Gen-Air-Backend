BEGIN;

ALTER TABLE public.users
  ADD COLUMN session_version integer NOT NULL DEFAULT 0
  CHECK (session_version >= 0);

CREATE TABLE public.auth_login_attempts (
  account_key char(64) PRIMARY KEY,
  attempt_count integer NOT NULL CHECK (attempt_count > 0),
  expires_at timestamptz NOT NULL
);
CREATE INDEX idx_auth_login_attempts_expires_at
  ON public.auth_login_attempts (expires_at);

ALTER TABLE public.auth_login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auth_login_attempts FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.auth_login_attempts FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.auth_login_attempts FROM authenticated;
  END IF;
END;
$$;

COMMIT;
