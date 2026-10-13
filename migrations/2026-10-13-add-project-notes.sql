-- Purpose: add free-text notes to projects, so a building's notes (including תמ"א notes) reach every apartment and each apartment keeps its own.
-- Date: 2026-10-13
-- One column serves both: on a building it is the "הערות האב" every apartment shows read-only; on an apartment it is that apartment's own notes.
-- Apartments never copy the building's notes; the API reads them from the building (resolve-on-read).

ALTER TABLE projects ADD COLUMN notes VARCHAR(4000);
