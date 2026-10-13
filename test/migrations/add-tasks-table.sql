-- Run after all schema migrations: psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f test/migrations/add-tasks-table.sql
-- Fixtures and mutations are rolled back. Use an isolated test database.
BEGIN;

DO $$
DECLARE
  creator_id UUID;
  assigned_user_id UUID;
  project_id_value UUID;
  customer_id_value UUID;
  stage_id_value UUID;
  type_id_value UUID;
  task_id_value UUID;
  task_row tasks%ROWTYPE;
  status_value task_status;
  column_name TEXT;
  enum_values TEXT[];
BEGIN
  INSERT INTO users (first_name, last_name, email, phone, role, password_hash)
    VALUES ('Task', 'Creator', 'task-creator@test.invalid', '0500000000', 'project_manager', 'test-only') RETURNING id INTO creator_id;
  INSERT INTO users (first_name, last_name, email, phone, role, password_hash)
    VALUES ('Task', 'Assignee', 'task-assignee@test.invalid', '0500000001', 'project_manager', 'test-only') RETURNING id INTO assigned_user_id;
  INSERT INTO project_stages (name, position) VALUES ('Task test stage', -100) RETURNING id INTO stage_id_value;
  INSERT INTO project_types (name, position, detail_field_set)
    VALUES ('Task test type', -100, 'company') RETURNING id INTO type_id_value;
  INSERT INTO projects (code, name, project_type_id, stage_id, created_by_id)
    VALUES ('TT-99999', 'Task test project', type_id_value, stage_id_value, creator_id) RETURNING id INTO project_id_value;
  INSERT INTO customers (customer_type, name, tax_id, address, contact_name, phone, email, created_by_id)
    VALUES ('company', 'Task customer', '000000001', 'Test address', 'Test contact', '0500000000', 'task-customer@test.invalid', creator_id) RETURNING id INTO customer_id_value;

  INSERT INTO tasks (project_id, customer_id, created_by_id, title)
    VALUES (project_id_value, customer_id_value, creator_id, 'Integration task') RETURNING * INTO task_row;
  task_id_value := task_row.id;
  IF task_row.status <> 'not_started' OR task_row.is_urgent OR task_row.assignee_id IS NOT NULL
     OR task_row.description IS NOT NULL OR task_row.due_date IS NOT NULL OR task_row.deleted_at IS NOT NULL
     OR task_row.created_at IS NULL OR task_row.updated_at IS NULL THEN
    RAISE EXCEPTION 'Unexpected task defaults';
  END IF;

  SELECT array_agg(enumlabel::TEXT ORDER BY enumsortorder) INTO enum_values
    FROM pg_enum WHERE enumtypid = 'task_status'::regtype;
  IF enum_values <> ARRAY['waiting_for_response', 'not_started', 'in_progress', 'in_review', 'proposal_sent'] THEN
    RAISE EXCEPTION 'Task statuses do not match the contract';
  END IF;
  FOREACH status_value IN ARRAY enum_range(NULL::task_status) LOOP
    UPDATE tasks SET status = status_value WHERE id = task_id_value;
  END LOOP;

  BEGIN
    EXECUTE 'UPDATE tasks SET status = ''invalid_status'' WHERE id = $1' USING task_id_value;
    RAISE EXCEPTION 'Invalid status accepted';
  EXCEPTION WHEN invalid_text_representation THEN NULL;
  END;
  BEGIN
    UPDATE tasks SET title = E' \t\n ' WHERE id = task_id_value;
    RAISE EXCEPTION 'Blank title accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE tasks SET is_urgent = NULL WHERE id = task_id_value;
    RAISE EXCEPTION 'Null urgency accepted';
  EXCEPTION WHEN not_null_violation THEN NULL;
  END;

  FOREACH column_name IN ARRAY ARRAY['project_id', 'customer_id', 'assignee_id', 'created_by_id'] LOOP
    BEGIN
      EXECUTE format('UPDATE tasks SET %I = $1 WHERE id = $2', column_name)
        USING gen_random_uuid(), task_id_value;
      RAISE EXCEPTION 'Missing FK target accepted for %', column_name;
    EXCEPTION WHEN foreign_key_violation OR restrict_violation THEN NULL;
    END;
  END LOOP;

  UPDATE tasks SET assignee_id = assigned_user_id, is_urgent = TRUE, due_date = '2026-10-15T12:00:00Z'
    WHERE id = task_id_value AND is_urgent = FALSE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Became urgent transition was not detectable'; END IF;
  UPDATE tasks SET is_urgent = TRUE WHERE id = task_id_value AND is_urgent = FALSE;
  IF FOUND THEN RAISE EXCEPTION 'Already urgent task transitioned again'; END IF;

  BEGIN
    DELETE FROM users WHERE id = assigned_user_id;
    RAISE EXCEPTION 'Referenced assignee hard delete accepted';
  EXCEPTION WHEN foreign_key_violation OR restrict_violation THEN NULL;
  END;
  BEGIN
    DELETE FROM customers WHERE id = customer_id_value;
    RAISE EXCEPTION 'Referenced customer hard delete accepted';
  EXCEPTION WHEN foreign_key_violation OR restrict_violation THEN NULL;
  END;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'tasks' AND indexname = 'idx_tasks_assignee_id_status'
    AND indexdef LIKE '%(assignee_id, status)%' AND indexdef LIKE '%WHERE (deleted_at IS NULL)%') THEN
    RAISE EXCEPTION 'Missing active dashboard index';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'tasks' AND indexname = 'idx_tasks_project_id'
    AND indexdef LIKE '%(project_id)%' AND indexdef LIKE '%WHERE (deleted_at IS NULL)%') THEN
    RAISE EXCEPTION 'Missing active project index';
  END IF;

  UPDATE tasks SET deleted_at = NOW() WHERE id = task_id_value;
  IF EXISTS (SELECT 1 FROM tasks WHERE id = task_id_value AND deleted_at IS NULL)
     OR NOT EXISTS (SELECT 1 FROM tasks WHERE id = task_id_value) THEN
    RAISE EXCEPTION 'Soft deletion did not preserve the task';
  END IF;
  RAISE NOTICE 'Task schema integration checks passed';
END $$;

ROLLBACK;
