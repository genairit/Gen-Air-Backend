\set ON_ERROR_STOP on
-- Disposable fixture database only, after all migrations preceding 2026-10-16.
INSERT INTO users (id,first_name,last_name,email,phone,role,password_hash)
VALUES ('11111111-1111-4111-8111-111111111111','Test','User','fixture@example.test','123','system_admin','fixture');
INSERT INTO projects (id,code,name,project_type_id,stage_id,created_by_id)
SELECT '22222222-2222-4222-8222-222222222222','QA-00001','Building',t.id,s.id,'11111111-1111-4111-8111-111111111111'
FROM project_types t,project_stages s WHERE t.name='בנייה רוויה' AND s.position=2;
INSERT INTO projects (id,code,name,project_type_id,stage_id,created_by_id,parent_project_id,customer_floor,customer_apartment,deleted_at)
SELECT '33333333-3333-4333-8333-333333333333','QA-00001-01','Deleted apartment',t.id,s.id,'11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','1','1',CURRENT_TIMESTAMP
FROM project_types t,project_stages s WHERE t.name='בנייה רוויה' AND s.position=3;
INSERT INTO project_stage_transitions (project_id,from_stage_id,to_stage_id,changed_by_id,changed_by_role)
SELECT '22222222-2222-4222-8222-222222222222',a.id,b.id,'11111111-1111-4111-8111-111111111111','system_admin'
FROM project_stages a,project_stages b WHERE a.position=1 AND b.position=2;

\ir ../../migrations/2026-10-16-fixed-project-statuses.sql
DO $$ BEGIN
  IF (SELECT array_agg(name ORDER BY position) FROM project_stages WHERE deleted_at IS NULL) <> ARRAY['ממתין','בעבודה','להמתין','הסתיים']::varchar[] THEN RAISE EXCEPTION 'Unexpected fixed catalog'; END IF;
  IF (SELECT count(*) FROM project_stages WHERE deleted_at IS NOT NULL) <> 4 THEN RAISE EXCEPTION 'Old stages were not preserved'; END IF;
  IF EXISTS (SELECT 1 FROM projects WHERE stage_id <> '6502a045-2a7d-4bc8-8ba1-36eaedc49a01') THEN RAISE EXCEPTION 'Existing projects were not reset'; END IF;
  IF (SELECT count(*) FROM project_stage_reset_snapshots) <> 2 THEN RAISE EXCEPTION 'Missing assignment snapshots'; END IF;
  IF (SELECT s.name FROM project_stage_reset_snapshots b JOIN project_stages s ON s.id=b.previous_stage_id WHERE b.project_id='22222222-2222-4222-8222-222222222222') <> 'הזמנה' THEN RAISE EXCEPTION 'Old assignment lost'; END IF;
  IF (SELECT s.name FROM project_stage_transitions h JOIN project_stages s ON s.id=h.to_stage_id LIMIT 1) <> 'הזמנה' THEN RAISE EXCEPTION 'Historical name changed'; END IF;
END; $$;

UPDATE projects SET stage_id='6502a045-2a7d-4bc8-8ba1-36eaedc49a04' WHERE id='22222222-2222-4222-8222-222222222222';
INSERT INTO projects (code,name,project_type_id,created_by_id)
SELECT 'QA-00002','Default waiting',id,'11111111-1111-4111-8111-111111111111' FROM project_types LIMIT 1;
\ir ../../migrations/2026-10-16-fixed-project-statuses.sql
DO $$ BEGIN
  IF (SELECT stage_id FROM projects WHERE id='22222222-2222-4222-8222-222222222222') <> '6502a045-2a7d-4bc8-8ba1-36eaedc49a04' THEN RAISE EXCEPTION 'Rerun reset a later status change'; END IF;
  IF (SELECT stage_id FROM projects WHERE code='QA-00002') <> '6502a045-2a7d-4bc8-8ba1-36eaedc49a01' THEN RAISE EXCEPTION 'New projects must default to waiting'; END IF;
  IF (SELECT count(*) FROM project_stage_reset_snapshots) <> 2 THEN RAISE EXCEPTION 'Rerun changed the snapshots'; END IF;
  BEGIN
    UPDATE project_stages SET name='edited' WHERE deleted_at IS NULL;
    RAISE EXCEPTION 'Expected immutable definitions';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE project_stages SET position=8 WHERE position=1 AND deleted_at IS NULL;
    RAISE EXCEPTION 'Expected immutable order';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO project_stages (name,position) VALUES ('custom',9);
    RAISE EXCEPTION 'Expected fixed catalog insert denial';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    DELETE FROM project_stages WHERE deleted_at IS NULL;
    RAISE EXCEPTION 'Expected fixed catalog delete denial';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    TRUNCATE project_stages CASCADE;
    RAISE EXCEPTION 'Expected fixed catalog truncate denial';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE projects SET stage_id=(SELECT id FROM project_stages WHERE deleted_at IS NOT NULL LIMIT 1) WHERE code='QA-00002';
    RAISE EXCEPTION 'Expected retired assignment denial';
  EXCEPTION WHEN check_violation THEN NULL; END;
END; $$;
SELECT 'Fixed project status migration checks passed' AS result;
