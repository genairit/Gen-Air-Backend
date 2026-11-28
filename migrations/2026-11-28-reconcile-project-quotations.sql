-- Apply with the project-required backend active. See the companion rollout notes.
BEGIN;
-- Quotation edits, project changes and writes to the evidence tables must not race the snapshot.
LOCK TABLE projects, tasks, task_quotation_links, quotation_publication_cycles,
  engineering_estimate_revisions, project_boqs, project_boq_revisions IN SHARE MODE;
LOCK TABLE quotations, quotation_projects IN SHARE ROW EXCLUSIVE MODE;

-- An operator may preload this session-local table with audited manual decisions.
CREATE TEMP TABLE IF NOT EXISTS reviewed_quotation_projects (
  quotation_id uuid PRIMARY KEY, project_id uuid NOT NULL
) ON COMMIT PRESERVE ROWS;

CREATE TEMP TABLE quotation_project_candidates ON COMMIT DROP AS
WITH unlinked AS (
  SELECT q.id, q.number, q.customer_id, primary_link.project_id AS previous_project_id
  FROM quotations q
  LEFT JOIN quotation_projects primary_link ON primary_link.quotation_id = q.id AND primary_link.is_primary
  LEFT JOIN projects primary_project ON primary_project.id = primary_link.project_id
  WHERE q.deleted_at IS NULL AND (primary_project.id IS NULL OR primary_project.deleted_at IS NOT NULL
                                    OR primary_project.customer_id IS DISTINCT FROM q.customer_id)
), evidence AS (
  SELECT l.quotation_id, t.project_id FROM task_quotation_links l JOIN tasks t ON t.id = l.task_id
  UNION ALL
  SELECT quotation_id, project_id FROM quotation_publication_cycles
  UNION ALL
  SELECT quotation_id, (snapshot->>'projectId')::uuid FROM engineering_estimate_revisions WHERE quotation_id IS NOT NULL
  UNION ALL
  SELECT source_quotation_id, project_id FROM project_boqs WHERE source_quotation_id IS NOT NULL
  UNION ALL
  SELECT r.source_quotation_id, b.project_id FROM project_boq_revisions r
    JOIN project_boqs b ON b.id = r.boq_id WHERE r.source_quotation_id IS NOT NULL
  UNION ALL
  SELECT l.quotation_id, apartment.parent_project_id FROM quotation_projects l
    JOIN projects apartment ON apartment.id = l.project_id WHERE NOT l.is_primary
), candidates AS (
  SELECT u.*, COALESCE(array_agg(DISTINCT e.project_id ORDER BY e.project_id)
         FILTER (WHERE e.project_id IS NOT NULL), '{}'::uuid[]) AS evidence_ids
  FROM unlinked u LEFT JOIN evidence e ON e.quotation_id = u.id
  GROUP BY u.id, u.number, u.customer_id, u.previous_project_id
), proposed AS (
  SELECT c.*, m.project_id AS reviewed_id,
    COALESCE(m.project_id, CASE WHEN c.previous_project_id IS NULL AND cardinality(c.evidence_ids) = 1
                                THEN c.evidence_ids[1] END) AS proposed_id
  FROM candidates c LEFT JOIN pg_temp.reviewed_quotation_projects m ON m.quotation_id = c.id
)
SELECT proposed.*, CASE
  WHEN proposed_id IS NULL THEN 'Review missing, conflicting or archived project evidence'
  WHEN p.id IS NULL OR p.deleted_at IS NOT NULL THEN 'Select an active project'
  WHEN p.customer_id IS DISTINCT FROM proposed.customer_id THEN 'Project and quotation customers differ'
  WHEN EXISTS (
    SELECT 1 FROM quotation_publication_cycles cycle WHERE cycle.quotation_id = proposed.id
      AND NOT cycle.terminal AND cycle.project_id <> proposed_id
  ) THEN 'Resolve the active publication cycle before changing its project'
  WHEN EXISTS (
    SELECT 1 FROM quotation_projects link JOIN projects apartment ON apartment.id = link.project_id
    WHERE link.quotation_id = proposed.id AND NOT link.is_primary
      AND apartment.parent_project_id IS DISTINCT FROM proposed_id
  ) THEN 'Resolve incompatible apartment sharing'
  WHEN EXISTS (
    SELECT 1 FROM task_quotation_links l JOIN tasks t ON t.id = l.task_id
    LEFT JOIN projects tp ON tp.id = t.project_id
    WHERE l.quotation_id = proposed.id AND (
      t.task_type <> 'quotation'
      OR (t.project_id IS NOT NULL AND t.project_id <> proposed_id)
      OR proposed.customer_id IS DISTINCT FROM CASE WHEN t.project_id IS NULL THEN t.customer_id ELSE tp.customer_id END
    )
  ) THEN 'Resolve incompatible task links'
END AS review_reason
FROM proposed LEFT JOIN projects p ON p.id = proposed.proposed_id;

-- Fail closed on a stale or invalid operator mapping. Replaying the same completed mapping is safe.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_temp.reviewed_quotation_projects m
    WHERE NOT EXISTS (SELECT 1 FROM pg_temp.quotation_project_candidates c
                      WHERE c.id = m.quotation_id AND c.review_reason IS NULL)
      AND NOT EXISTS (SELECT 1 FROM quotations q
                      JOIN quotation_projects l ON l.quotation_id = q.id AND l.is_primary
                      JOIN projects p ON p.id = l.project_id AND p.deleted_at IS NULL
                      WHERE q.id = m.quotation_id AND q.deleted_at IS NULL AND l.project_id = m.project_id AND p.customer_id = q.customer_id)
  ) THEN RAISE EXCEPTION 'A reviewed quotation/project pair is invalid or stale. Recheck before applying.';
  END IF;
END $$;

-- Replace an ineligible primary only when the operator supplied an explicit replacement.
DELETE FROM quotation_projects l USING pg_temp.quotation_project_candidates c
WHERE l.quotation_id = c.id AND l.is_primary AND l.project_id = c.previous_project_id
  AND c.reviewed_id IS NOT NULL AND c.review_reason IS NULL;

INSERT INTO quotation_projects (quotation_id, project_id, is_primary)
SELECT id, proposed_id, true FROM pg_temp.quotation_project_candidates WHERE review_reason IS NULL;

SELECT id AS quotation_id, number, customer_id, previous_project_id, evidence_ids,
       proposed_id, COALESCE(review_reason, 'Assigned') AS result
FROM pg_temp.quotation_project_candidates ORDER BY number;
COMMIT;
