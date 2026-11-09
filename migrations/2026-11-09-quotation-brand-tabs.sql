BEGIN;

ALTER TABLE quotations
  ADD COLUMN brands jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN warning_scope_version smallint NOT NULL DEFAULT 1;

UPDATE quotations
SET brands = jsonb_build_array(brand)
WHERE brand <> '';

ALTER TABLE quotation_sections
  ADD COLUMN brand varchar(100);

UPDATE quotation_sections AS section
SET brand = quotation.brand
FROM quotations AS quotation
WHERE section.quotation_id = quotation.id AND quotation.brand <> '';

ALTER TABLE quotations
  ADD CONSTRAINT quotation_brands_array CHECK (jsonb_typeof(brands) = 'array');

COMMIT;
