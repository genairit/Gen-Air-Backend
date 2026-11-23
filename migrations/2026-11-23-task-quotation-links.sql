-- Explicit durable quotation-task associations. Backend only; no environment changes.
BEGIN;
CREATE TABLE task_quotation_links (
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
  quotation_id uuid NOT NULL REFERENCES quotations(id) ON DELETE RESTRICT,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(task_id, quotation_id)
);
CREATE UNIQUE INDEX task_quotation_links_one_primary ON task_quotation_links(task_id) WHERE is_primary;
CREATE INDEX task_quotation_links_quotation ON task_quotation_links(quotation_id);
ALTER TABLE task_quotation_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON task_quotation_links FROM PUBLIC, anon, authenticated;
-- Context constraints also cover internal writers, task deletion history and project edits.
CREATE FUNCTION check_task_quotation_context() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  affected jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
BEGIN
  IF EXISTS (
    SELECT 1 FROM task_quotation_links l
    JOIN tasks t ON t.id=l.task_id
    JOIN quotations q ON q.id=l.quotation_id
    LEFT JOIN projects p ON p.id=t.project_id
    LEFT JOIN quotation_projects qp ON qp.quotation_id=q.id AND qp.is_primary=true
    WHERE (
      (TG_TABLE_NAME = 'task_quotation_links' AND l.task_id = (affected->>'task_id')::uuid AND l.quotation_id = (affected->>'quotation_id')::uuid)
      OR (TG_TABLE_NAME = 'tasks' AND t.id = (affected->>'id')::uuid)
      OR (TG_TABLE_NAME = 'quotations' AND q.id = (affected->>'id')::uuid)
      OR (TG_TABLE_NAME = 'quotation_projects' AND q.id = (affected->>'quotation_id')::uuid)
      OR (TG_TABLE_NAME = 'projects' AND (t.project_id = (affected->>'id')::uuid OR qp.project_id = (affected->>'id')::uuid))
    ) AND (t.task_type <> 'quotation'
      OR q.customer_id IS DISTINCT FROM CASE WHEN t.project_id IS NULL THEN t.customer_id ELSE p.customer_id END
      OR (t.project_id IS NOT NULL AND qp.project_id IS DISTINCT FROM t.project_id)
      OR (t.project_id IS NULL AND qp.project_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM projects optional_project WHERE optional_project.id=qp.project_id AND optional_project.customer_id=t.customer_id
      ))
    )
  ) THEN
    RAISE EXCEPTION 'Linked task quotation context cannot change' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION check_task_quotation_context() FROM PUBLIC, anon, authenticated;
CREATE CONSTRAINT TRIGGER task_quotation_links_context AFTER INSERT OR UPDATE ON task_quotation_links DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_task_quotation_context();
CREATE CONSTRAINT TRIGGER task_quotation_task_context AFTER UPDATE ON tasks DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_task_quotation_context();
CREATE CONSTRAINT TRIGGER task_quotation_customer_context AFTER UPDATE ON quotations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_task_quotation_context();
CREATE CONSTRAINT TRIGGER task_quotation_project_context AFTER INSERT OR UPDATE OR DELETE ON quotation_projects DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_task_quotation_context();
CREATE CONSTRAINT TRIGGER task_quotation_project_customer_context AFTER UPDATE ON projects DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_task_quotation_context();
COMMIT;
