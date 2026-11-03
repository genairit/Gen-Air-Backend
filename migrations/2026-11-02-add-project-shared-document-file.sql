-- Store one parent project Drive file reference. Apartments resolve it via parent_project_id.
BEGIN;

ALTER TABLE projects
  ADD COLUMN shared_document_file_id varchar(128),
  ADD CONSTRAINT chk_parent_project_shared_document
    CHECK (shared_document_file_id IS NULL OR parent_project_id IS NULL);

COMMIT;
