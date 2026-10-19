-- Temporary generated aliases keep the previous backend's read-only ERP fields readable during rollout.
ALTER TABLE public.projects RENAME COLUMN erp_reference TO priority_id;
ALTER TABLE public.projects RENAME COLUMN erp_synced_at TO priority_synced_at;

ALTER TABLE public.projects
  ADD COLUMN erp_reference VARCHAR(64) GENERATED ALWAYS AS (priority_id) STORED,
  ADD COLUMN erp_synced_at TIMESTAMPTZ(3) GENERATED ALWAYS AS (priority_synced_at) STORED;
