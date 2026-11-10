-- Preserve the quotation creator's display name for every future PDF export.
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS issuer_name varchar(160);

UPDATE quotations AS q
SET issuer_name = CONCAT_WS(' ', u.first_name, u.last_name)
FROM users AS u
WHERE q.created_by_id = u.id AND q.issuer_name IS NULL;

ALTER TABLE quotations ALTER COLUMN issuer_name SET NOT NULL;
