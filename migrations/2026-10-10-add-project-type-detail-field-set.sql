-- Purpose: tell each project type which customer detail field set it requires, and rename the fifth type from אחר to מוסד per the design.
-- Date: 2026-10-10
-- The field set is data on project_types rather than a name lookup in code, so a type can be renamed without silently losing its rule.
-- Existing projects of the renamed type keep their rows and become institution projects.

CREATE TYPE project_detail_field_set AS ENUM ('company', 'private_client', 'institution');

UPDATE project_types
SET name        = 'מוסד',
    subtitle    = 'עמותות ומוסדות ציבור',
    description = 'עמותות, בתי ספר, בתי חולים ומוסדות ציבור עם מספר עמותה (מ״ע).',
    tag         = 'מזהה מ״ע',
    updated_at  = NOW()
WHERE name = 'אחר';

ALTER TABLE project_types ADD COLUMN detail_field_set project_detail_field_set;

UPDATE project_types
SET detail_field_set = CASE name
  WHEN 'בנייה רוויה'           THEN 'company'::project_detail_field_set
  WHEN 'מסחרי (VRF / צ׳ילרים)' THEN 'company'::project_detail_field_set
  WHEN 'לקוחות פרטיים'         THEN 'private_client'::project_detail_field_set
  WHEN 'דירות יוקרה'           THEN 'private_client'::project_detail_field_set
  WHEN 'מוסד'                  THEN 'institution'::project_detail_field_set
END;

ALTER TABLE project_types ALTER COLUMN detail_field_set SET NOT NULL;
