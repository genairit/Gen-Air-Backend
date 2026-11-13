export const QUOTATION_PROJECT_QUERY = {
  PRIMARY_PROJECTS: `SELECT link.quotation_id AS "quotationId", project.id, project.name, project.code,
    CASE WHEN project.parent_project_id IS NOT NULL THEN $apartmentKind
         WHEN project_type.can_have_apartments THEN $buildingKind
         ELSE $projectKind END AS kind
    FROM quotation_projects link
    JOIN projects project ON project.id = link.project_id
    LEFT JOIN project_types project_type ON project_type.id = project.project_type_id
    WHERE link.is_primary AND link.quotation_id = ANY($quotationIds::uuid[])`,
  APARTMENT_LINKS: `SELECT link.quotation_id AS "quotationId", apartment.id AS "apartmentId",
    apartment.customer_apartment AS "apartmentNumber", apartment.customer_floor AS floor,
    COALESCE(customer.name, apartment.customer_name) AS "endCustomerName",
    COALESCE(apartment.deleted_at IS NULL AND apartment.parent_project_id = primary_link.project_id, false) AS available
    FROM quotation_projects link
    JOIN projects apartment ON apartment.id = link.project_id
    LEFT JOIN customers customer ON customer.id = apartment.customer_id
    LEFT JOIN quotation_projects primary_link ON primary_link.quotation_id = link.quotation_id AND primary_link.is_primary
    WHERE NOT link.is_primary AND link.quotation_id = ANY($quotationIds::uuid[])`,
} as const;
