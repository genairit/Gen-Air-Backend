-- Purpose: on-demand PDF page text index backing Jenny's project document search.
-- Date: 2026-11-25
BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$
BEGIN
  CREATE TYPE enum_project_documents_status AS ENUM (
    'indexed',
    'scanned',
    'too_large',
    'unreadable',
    'too_many_pages'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.project_documents (
  project_id          uuid         NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  file_id             varchar(128) NOT NULL,
  drive_modified_time timestamptz,
  md5_checksum        varchar(32),
  page_count          integer      NOT NULL DEFAULT 0 CHECK (page_count >= 0),
  status              enum_project_documents_status NOT NULL,
  indexed_at          timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, file_id)
);

CREATE TABLE IF NOT EXISTS public.project_document_pages (
  project_id    uuid         NOT NULL,
  file_id       varchar(128) NOT NULL,
  page_number   integer      NOT NULL CHECK (page_number > 0),
  text          text         NOT NULL,
  search_vector tsvector     GENERATED ALWAYS AS (to_tsvector('simple', text)) STORED,
  PRIMARY KEY (project_id, file_id, page_number),
  FOREIGN KEY (project_id, file_id)
    REFERENCES public.project_documents (project_id, file_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_project_document_pages_search_vector
  ON public.project_document_pages USING gin (search_vector);

CREATE INDEX IF NOT EXISTS idx_project_document_pages_text_trgm
  ON public.project_document_pages USING gin (text gin_trgm_ops);

ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_document_pages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_documents, public.project_document_pages FROM PUBLIC, anon, authenticated;

COMMIT;
