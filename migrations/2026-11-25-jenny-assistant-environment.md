# Add the Jenny AI assistant environment

Date: 2026-11-25

Apply `2026-11-25-project-document-search-index.sql` before deploying the Backend that serves
`POST /jenny/chat`. It enables `pg_trgm` (no-op when already enabled) and adds the private
`project_documents` and `project_document_pages` tables (RLS enabled, Data API grants revoked).
On Supabase the extension objects may live in `public` or `extensions`; the Backend connection's
default search path already includes both, so no further change is needed.

## What to add

- `OPENAI_API_KEY` — required for Jenny. Leaving it unset or empty (`OPENAI_API_KEY=`) is valid:
  the server still starts and every other feature works, but `POST /jenny/chat` answers `503`
  after the permission and project checks.
- `JENNY_MODEL` — optional; unset or empty uses `gpt-5.4-mini`. Any OpenAI Chat Completions model
  that supports function calling.
- `JENNY_MAX_TOOL_ROUNDS` — optional; unset or empty uses `5`. A whole number from `1` to `10`;
  how many rounds of tool calls Jenny may run before she must answer with what she has. Any other
  value never blocks startup: Jenny logs a warning and uses `5`.

Each chat request is bounded by a 2-minute deadline (and is cancelled when the client
disconnects), at most 4 tool calls per round, and a 40-second PDF indexing budget per request.

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
