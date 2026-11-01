# Exact project names and lighting lowering

Apply SQL `2026-10-31-project-name-uniqueness-and-lighting.sql` before deploying the matching backend. No new environment variables. Existing records receive disabled/null. Heights are centimeters, finite nonnegative double precision; decimals and zero are valid, disabled clears saved height.

## Inventory and rollout

Run this read-only inventory separately in every target environment:

```sql
SELECT btrim(name, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') COLLATE "C" AS normalized_name, count(*) AS active_count,
       array_agg(id ORDER BY id) AS project_ids
FROM public.projects WHERE deleted_at IS NULL
GROUP BY btrim(name, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') COLLATE "C" HAVING count(*) > 1;
```

If any rows return, stop. Obtain an explicit resolution for each ID; never silently rename, delete, or merge data. Apartments are deliberately included in global uniqueness. Existing generic apartment names can block rollout, and creating/importing another same-named apartment will return a conflict even under another building. No apartment naming convention is changed by this migration.

The index compares JS-trimmed names using deterministic `C` collation, preserving case and internal spaces. It covers only live rows, so deleted names can be reused. No existing name values are rewritten. The application trims new/changed names. Direct SQL is also protected by the expression index.

The SQL holds a write-excluding table lock across preflight and index creation. Schedule a short maintenance window based on table size; reads remain available. Failure rolls back the entire transaction, including new columns. Verify both index validity and height constraint after execution; exercise create/edit/read, duplicate409, case differences, name reuse and concurrent writes on a disposable stack first.

Development read-only raw and JS-trimmed exact-name inventories on 2026-10-31 each found zero duplicate groups; this is not proof for other environments or a later rollout. No shared migration has been applied as part of development.

## Recovery

Restore the previous application release before removing columns. If rollback is approved, drop `uq_projects_active_exact_name`, `chk_projects_lighting_height`, and the two new columns in a new migration. Dropping columns loses saved lighting settings; take a backup first. Do not edit an already-applied migration.
