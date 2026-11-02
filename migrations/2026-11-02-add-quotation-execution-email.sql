-- Optional email after a quotation task reaches proposal_sent. One delivery record per task.
BEGIN;

CREATE TABLE quotation_execution_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  sender_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  architect_contact_id uuid NOT NULL REFERENCES customer_contacts(id) ON DELETE RESTRICT,
  plan_file_id varchar(128) NOT NULL,
  zip_file_id varchar(128) NOT NULL,
  plan_version varchar(80) NOT NULL,
  recipient_contact_ids uuid[] NOT NULL,
  recipient_emails text[] NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  status varchar(20) NOT NULL,
  provider_message_id varchar(255),
  error_code varchar(100),
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT chk_quotation_execution_email_status CHECK (status IN ('preparing', 'sending', 'sent', 'failed', 'uncertain')),
  CONSTRAINT chk_quotation_execution_email_distinct_files CHECK (plan_file_id <> zip_file_id),
  CONSTRAINT chk_quotation_execution_email_recipients CHECK (cardinality(recipient_emails) > 0)
);

ALTER TABLE quotation_execution_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON quotation_execution_emails FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON quotation_execution_emails FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON quotation_execution_emails FROM authenticated;
  END IF;
END $$;

CREATE UNIQUE INDEX uq_quotation_execution_emails_task ON quotation_execution_emails(task_id);

COMMIT;
