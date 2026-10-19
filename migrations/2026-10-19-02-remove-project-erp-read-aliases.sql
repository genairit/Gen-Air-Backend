-- Deploy the Priority-named backend before removing the previous backend's read aliases.
ALTER TABLE public.projects
  DROP COLUMN erp_reference,
  DROP COLUMN erp_synced_at;
