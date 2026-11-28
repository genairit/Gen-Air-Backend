-- Add optional floor grouping. Existing quotations retain their section order and titles.
BEGIN;
ALTER TABLE quotation_sections
  ADD COLUMN floor_id uuid,
  ADD COLUMN floor_name varchar(200),
  ADD CONSTRAINT quotation_section_floor_assignment CHECK (
    (floor_id IS NULL AND floor_name IS NULL)
    OR (floor_id IS NOT NULL AND floor_name IS NOT NULL AND btrim(floor_name) <> '' AND brand IS NOT NULL)
  );
COMMIT;
