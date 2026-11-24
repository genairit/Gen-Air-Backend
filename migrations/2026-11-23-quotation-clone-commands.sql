-- Purpose: retain successful recommended quotation clone commands across retries.
-- CLI source: 20261123191855_quotation_clone_commands.sql (Supabase CLI 3.3.0).
BEGIN;
CREATE TABLE quotation_clone_commands (
  actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL,
  payload_hash varchar(64) NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  quotation_id uuid NOT NULL REFERENCES quotations(id) ON DELETE RESTRICT,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT uq_quotation_clone_commands_actor_key PRIMARY KEY (actor_id, idempotency_key)
);
CREATE INDEX idx_quotation_clone_commands_quotation ON quotation_clone_commands(quotation_id);
ALTER TABLE quotation_clone_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE quotation_clone_commands FROM PUBLIC, anon, authenticated;
COMMIT;
