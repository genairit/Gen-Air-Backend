-- Purpose: add the payment terms (תנאי תשלום) chosen for each project, and the free-text detail captured when "אחר" is chosen.
-- Date: 2026-10-10
-- Which options are legal for which project type is enforced in the project module, not here:
-- private_client types (פרטי, יוקרה) allow installments_10_60_30, prepaid and other;
-- company and institution types (מסחרי, בנייה רוויה, מוסד) allow milestones_net_60, twelve_prepaid_checks and other.
-- That rule follows project_types.detail_field_set, which a constraint on projects cannot read.
-- Both columns stay nullable because existing projects predate the requirement; requiring them on new projects is also a module rule.
-- The CHECK only keeps the row coherent: a note exists solely alongside "other". Its required length (10–300) is a module rule.

CREATE TYPE payment_terms AS ENUM ('installments_10_60_30', 'prepaid', 'milestones_net_60', 'twelve_prepaid_checks', 'other');

ALTER TABLE projects
  ADD COLUMN payment_terms      payment_terms,
  ADD COLUMN payment_terms_note VARCHAR(300),
  ADD CONSTRAINT chk_projects_payment_terms_note_only_for_other
    CHECK (payment_terms_note IS NULL OR payment_terms IS NOT DISTINCT FROM 'other');
