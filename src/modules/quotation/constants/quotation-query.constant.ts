export const QUOTATION_QUERY = {
  JOINS:
    'FROM quotations q LEFT JOIN customers c ON c.id=q.customer_id LEFT JOIN projects p ON p.id=q.project_id',
  SEARCH:
    "q.deleted_at IS NULL AND concat_ws(' ',q.number,q.brand,c.name,p.name) ILIKE $search",
} as const;
