# Link existing quotations before retiring the global quotation list

Deploy the project-aware create and edit paths and the backend that requires a project for every save. The frontend cutover depends on the last check below. Run these SQL files against the intended database using a private migration connection. Each file can be rerun. The reconciliation transaction briefly blocks writes to the records used to determine the assignments.

1. Run `psql -X -v ON_ERROR_STOP=1 -f migrations/2026-11-28-reconcile-project-quotations.sql`. Save the resulting ID and evidence report in the deployment record. The script considers live quotations with no primary project, an archived primary, or a primary assigned to a different customer. Replacing an existing primary requires explicit review.
2. A single compatible project identified by a quotation task, publication cycle, approved estimate snapshot, source BOQ, or the parent of a shared apartment qualifies for automatic assignment. Existing eligible primary links and quote contents stay intact. Customer identity alone does not prove which project was intended. An execution-plan file can belong to a shared apartment and does not establish the primary project.
3. For each unresolved quotation, confirm its actual project with the project owner. The selected project must be active, belong to the quotation customer, and fit its task and apartment links. Resolve conflicting task or apartment associations through their owners before retrying. For an archived project, either restore the correct project or select a verified active replacement. For a customer mismatch, confirm whether the project association or the customer record needs correction.
4. In one private psql session, load the confirmed pairs and repeat the reconciliation. Use a locally protected CSV with the header `quotation_id,project_id`. The script rejects invalid or stale mappings and accepts repeated identical assignments.

```sql
\set ON_ERROR_STOP on
CREATE TEMP TABLE reviewed_quotation_projects (quotation_id uuid PRIMARY KEY, project_id uuid NOT NULL);
\copy reviewed_quotation_projects FROM '/private/path/reviewed.csv' WITH (FORMAT csv, HEADER true)
\i migrations/2026-11-28-reconcile-project-quotations.sql
```

5. Run `psql -X -v ON_ERROR_STOP=1 -f migrations/checks/verify-project-quotations.sql` immediately before frontend cutover. Its read-only check fails if any live quotation still lacks a primary link to an existing, active project for its customer. Reconcile the IDs against the saved report and verify representative quotations using the paginated project quotation endpoint, including a shared apartment. Retire the global list only after verification succeeds.
