\set ON_ERROR_STOP on
-- Disposable database only: this fixture clears the template table.
TRUNCATE drive_template_folders;
\ir ../../migrations/2026-10-17-seed-default-project-drive-folders.sql

DO $$ BEGIN
  IF (SELECT array_agg(name ORDER BY position) FROM drive_template_folders)
     IS DISTINCT FROM ARRAY['סכמות לאחר ביצוע','טיוטה','סכמות','DWG','הזמנה לביצוע','הזמנות רכש ציוד','PDF','מהאדריכל','הזמנות רכש','ZIP','הצעות מספקים','הצעות מחיר']::varchar[]
  THEN RAISE EXCEPTION 'Default folder names or order differ from the reference'; END IF;
  IF EXISTS (SELECT 1 FROM drive_template_folders WHERE parent_id IS NOT NULL)
  THEN RAISE EXCEPTION 'Default folders must all be project-root children'; END IF;
END; $$;

CREATE TEMP TABLE seeded_template_snapshot AS SELECT * FROM drive_template_folders;
\ir ../../migrations/2026-10-17-seed-default-project-drive-folders.sql
DO $$ BEGIN
  IF EXISTS (SELECT * FROM drive_template_folders EXCEPT SELECT * FROM seeded_template_snapshot)
     OR EXISTS (SELECT * FROM seeded_template_snapshot EXCEPT SELECT * FROM drive_template_folders)
  THEN RAISE EXCEPTION 'Rerun changed default template rows'; END IF;
END; $$;

TRUNCATE drive_template_folders;
INSERT INTO drive_template_folders (id, parent_id, name, position) VALUES
  ('11111111-1111-4111-8111-111111111111',NULL,'PDF',7),
  ('22222222-2222-4222-8222-222222222222',NULL,'Custom folder',90),
  ('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222','DWG',1);
CREATE TEMP TABLE original_template_snapshot AS SELECT * FROM drive_template_folders;
\ir ../../migrations/2026-10-17-seed-default-project-drive-folders.sql
DO $$ BEGIN
  IF (SELECT count(*) FROM drive_template_folders WHERE parent_id IS NULL) <> 13
  THEN RAISE EXCEPTION 'Expected twelve defaults plus the custom root'; END IF;
  IF (SELECT count(*) FROM drive_template_folders WHERE parent_id IS NULL AND name='PDF') <> 1
  THEN RAISE EXCEPTION 'Existing root PDF was duplicated'; END IF;
  IF (SELECT count(*) FROM drive_template_folders WHERE name='DWG') <> 2
  THEN RAISE EXCEPTION 'Nested DWG must not prevent a required root DWG'; END IF;
  IF EXISTS (SELECT * FROM original_template_snapshot EXCEPT SELECT * FROM drive_template_folders)
  THEN RAISE EXCEPTION 'Custom or reused rows changed'; END IF;
  IF (SELECT position FROM drive_template_folders WHERE name='סכמות לאחר ביצוע') <> 91
     OR (SELECT position FROM drive_template_folders WHERE name='הצעות מחיר') <> 101
  THEN RAISE EXCEPTION 'Missing roots must append in reference order'; END IF;
END; $$;

TRUNCATE seeded_template_snapshot;
INSERT INTO seeded_template_snapshot SELECT * FROM drive_template_folders;
\ir ../../migrations/2026-10-17-seed-default-project-drive-folders.sql
DO $$ BEGIN
  IF EXISTS (SELECT * FROM drive_template_folders EXCEPT SELECT * FROM seeded_template_snapshot)
     OR EXISTS (SELECT * FROM seeded_template_snapshot EXCEPT SELECT * FROM drive_template_folders)
  THEN RAISE EXCEPTION 'Rerun changed a populated template'; END IF;
END; $$;
