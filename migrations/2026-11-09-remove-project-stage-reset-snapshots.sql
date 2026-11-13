-- Purpose: retire the one-time 2026-10-16 project status reset recovery table.
-- Date: 2026-11-09
-- The application has no runtime dependency on this table. This intentionally
-- discards its historical pre-reset assignments and timestamps.

DROP TABLE IF EXISTS public.project_stage_reset_snapshots;
