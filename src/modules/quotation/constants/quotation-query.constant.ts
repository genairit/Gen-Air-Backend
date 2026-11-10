export const QUOTATION_QUERY = {
  JOINS:
    'FROM quotations q LEFT JOIN customers c ON c.id=q.customer_id LEFT JOIN quotation_projects qp ON qp.quotation_id=q.id AND qp.is_primary LEFT JOIN projects p ON p.id=qp.project_id',
  SEARCH:
    "q.deleted_at IS NULL AND concat_ws(' ',q.number,q.brands::text,c.name,p.name) ILIKE $search",
  PROJECT_SCOPE:
    '($projectId::uuid IS NULL OR EXISTS (SELECT 1 FROM quotation_projects scope_link JOIN projects scope_project ON scope_project.id=scope_link.project_id WHERE scope_link.quotation_id=q.id AND scope_link.project_id=$projectId::uuid AND (scope_link.is_primary OR (scope_project.deleted_at IS NULL AND scope_project.parent_project_id=qp.project_id))))',
} as const;
