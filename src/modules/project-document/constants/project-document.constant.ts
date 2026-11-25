import { TIME_UNITS } from '@Constants/time.constant';
import { BYTE_UNITS } from '@Constants/size.constant';

export const PROJECT_DOCUMENT_STATUSES = {
  INDEXED: 'indexed',
  SCANNED: 'scanned',
  TOO_LARGE: 'too_large',
  UNREADABLE: 'unreadable',
  TOO_MANY_PAGES: 'too_many_pages',
} as const;

export type ProjectDocumentStatusType =
  (typeof PROJECT_DOCUMENT_STATUSES)[keyof typeof PROJECT_DOCUMENT_STATUSES];

export const PROJECT_DOCUMENT_STATUS_VALUES: readonly ProjectDocumentStatusType[] =
  Object.values(PROJECT_DOCUMENT_STATUSES);

export const PROJECT_DOCUMENT_SKIP_REASONS = {
  ...PROJECT_DOCUMENT_STATUSES,
  DOWNLOAD_FAILED: 'download_failed',
} as const;

export type ProjectDocumentSkipReasonType =
  (typeof PROJECT_DOCUMENT_SKIP_REASONS)[keyof typeof PROJECT_DOCUMENT_SKIP_REASONS];

export const PROJECT_DOCUMENT_LIMITS = {
  MAX_PAGES: 300,
  MAX_SEARCH_HITS: 8,
  MAX_PAGE_CHARACTERS: 20000,
  MAX_FILES_PER_REFRESH: 15,
  MIN_TEXT_CHARACTERS: 20,
  MAX_FILE_BYTES: 25 * BYTE_UNITS.MEGABYTE,
  EXTRACTION_TIMEOUT_MS: 20 * TIME_UNITS.SECOND_MS,
  REFRESH_BUDGET_MS: 40 * TIME_UNITS.SECOND_MS,
} as const;

export const PROJECT_DOCUMENT_LOCK_PREFIX = 'project-document';

export const PDF_JS_ERRORS_ONLY_VERBOSITY = 0;

export const PROJECT_DOCUMENT_SEARCH_QUERY = `
WITH search AS (
  SELECT replace(plainto_tsquery('simple', $query)::text, '&', '|') AS terms
),
matches AS (
  SELECT
    page.file_id AS "fileId",
    page.page_number AS "pageNumber",
    page.text,
    CASE WHEN search.terms = '' THEN 0
      ELSE ts_rank(page.search_vector, search.terms::tsquery) END AS rank,
    word_similarity($query, page.text) AS similarity,
    search.terms
  FROM project_document_pages page, search
  WHERE page.project_id = $projectId
    AND (
      (search.terms <> '' AND page.search_vector @@ search.terms::tsquery)
      OR $query <% page.text
    )
)
SELECT
  "fileId",
  "pageNumber",
  CASE WHEN terms = '' THEN left(text, 300)
    ELSE ts_headline('simple', text, terms::tsquery, 'MaxWords=40, MinWords=15, MaxFragments=2, StartSel=«, StopSel=»')
  END AS snippet
FROM matches
ORDER BY rank + similarity DESC, "fileId", "pageNumber"
LIMIT $limit
`;
