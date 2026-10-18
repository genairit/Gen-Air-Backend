-- Purpose: add the per-project-type customer detail fields (company, private client and institution) to projects.
-- Date: 2026-10-10
-- Decision: one nullable column per field on projects, matching how the rest of the schema is written and keeping every field queryable and constrainable.
-- A satellite table adds a join for a strict 1:1 relation, and JSONB loses typing, indexing and CHECK constraints.
-- Which columns are required depends on the project type, so that rule is enforced in the project module, not here.
-- Fields shared between types (name, address, phone, email, floor) use one column, so their values survive a project type switch.

ALTER TABLE projects
  ADD COLUMN customer_name               VARCHAR(200),
  ADD COLUMN customer_company_number     VARCHAR(9)   CHECK (customer_company_number ~ '^[0-9]{9}$'),
  ADD COLUMN customer_association_number VARCHAR(9)   CHECK (customer_association_number ~ '^[0-9]{9}$'),
  ADD COLUMN customer_address            VARCHAR(200),
  ADD COLUMN customer_city               VARCHAR(80),
  ADD COLUMN customer_phone              VARCHAR(20),
  ADD COLUMN customer_email              VARCHAR(254),
  ADD COLUMN customer_floor              SMALLINT,
  ADD COLUMN customer_apartment          VARCHAR(10),
  ADD COLUMN customer_unit               VARCHAR(60);
