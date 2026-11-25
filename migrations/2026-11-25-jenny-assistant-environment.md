# Add the Jenny AI assistant environment

Date: 2026-11-25

Apply `2026-11-25-project-document-search-index.sql` before deploying the Backend that serves
`POST /jenny/chat`. It enables `pg_trgm` (no-op when already enabled) and adds the private
`project_documents` and `project_document_pages` tables (RLS enabled, Data API grants revoked).
On Supabase the extension objects may live in `public` or `extensions`; the Backend connection's
default search path already includes both, so no further change is needed.

## What to add

- `OPENAI_API_KEY` — required for Jenny. Without it the server still starts and every other
  feature works, but `POST /jenny/chat` answers `503` after the permission and project checks.
- `JENNY_MODEL` — optional, defaults to `gpt-5.4-mini`. Any OpenAI Chat Completions model that
  supports function calling.
- `JENNY_MAX_TOOL_ROUNDS` — optional, defaults to `5`. A whole number from `1` to `10`; how many
  rounds of tool calls Jenny may run before she must answer with what she has. Invalid values fall
  back to the default and log a warning.

## Why

Jenny (ג׳ני) answers questions about the open project page in Hebrew. The Backend calls OpenAI
with read-only tools (project status, quotations, Drive file list, PDF search), so the key never
reaches the browser. Requests are rate limited per user, each OpenAI call is bounded by a timeout,
and logs record only token counts, tool names and duration — never message or document text.

## Value

- `OPENAI_API_KEY`: an OpenAI project API key, for example `sk-proj-EXAMPLEEXAMPLEEXAMPLE`. Use a
  separate key per environment, restricted to the Chat Completions API with a monthly budget cap.
  Never commit the key.
- `JENNY_MODEL`: for example `gpt-5.4-mini`.
- `JENNY_MAX_TOOL_ROUNDS`: for example `5`.

## Rollback

Unset `OPENAI_API_KEY` to disable Jenny (the endpoint answers `503`). The index tables are
additive and can stay in place; they hold only text re-derivable from the project's Drive files.
