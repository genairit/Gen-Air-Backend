-- Purpose: seed the required root folders used when provisioning new project Drive folders.
-- Date: 2026-10-17
BEGIN;

LOCK TABLE drive_template_folders IN SHARE ROW EXCLUSIVE MODE;

WITH required_folders (name, template_order) AS (
  VALUES
    ('סכמות לאחר ביצוע', 1),
    ('טיוטה', 2),
    ('סכמות', 3),
    ('DWG', 4),
    ('הזמנה לביצוע', 5),
    ('הזמנות רכש ציוד', 6),
    ('PDF', 7),
    ('מהאדריכל', 8),
    ('הזמנות רכש', 9),
    ('ZIP', 10),
    ('הצעות מספקים', 11),
    ('הצעות מחיר', 12)
), missing_folders AS (
  SELECT required_folders.*
  FROM required_folders
  WHERE NOT EXISTS (
    SELECT 1 FROM drive_template_folders existing_folder
    WHERE existing_folder.parent_id IS NULL
      AND existing_folder.name = required_folders.name
  )
), last_root_position AS (
  SELECT COALESCE(MAX(position), 0) AS position
  FROM drive_template_folders
  WHERE parent_id IS NULL
)
INSERT INTO drive_template_folders (parent_id, name, position)
SELECT NULL, missing_folders.name,
       last_root_position.position + ROW_NUMBER() OVER (ORDER BY template_order)
FROM missing_folders CROSS JOIN last_root_position
ORDER BY template_order;

COMMIT;
