# Add Google Drive service-account JSON configuration

Date: 2026-10-15

## Environment change

`GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` — optional, defaults to absent. Contains the
complete JSON object from a downloaded Google service-account key. This enables
Railway deployment without storing a key file in the image or repository.

When set, it takes precedence over Application Default Credentials (including
`GOOGLE_APPLICATION_CREDENTIALS`). When absent, existing authentication works
unchanged. Invalid JSON or missing `type: service_account`, `client_email`, or
`private_key` fails startup with a sanitized configuration error.

The value is a JSON object serialized as text, not base64, not a filename:

```json
{
  "type": "service_account",
  "project_id": "example-project",
  "client_email": "example@example-project.iam.gserviceaccount.com",
  "private_key": "<private key from downloaded JSON>"
}
```

This is a shape example only; use the complete downloaded JSON for authentication.
Preserve the escaped `\n` characters inside the JSON private-key string.
Never put a real key in this file, Git, logs, Trello, or chat.

## Local setup

1. Enable Google Drive API in the service account's Cloud project.
2. Add its email to the company Shared Drive with **Content manager** access.
3. Keep the downloaded JSON key outside the checkout.
4. Add these settings to the local backend environment:

```dotenv
GOOGLE_DRIVE_ROOT_FOLDER_ID=<company project parent folder ID>
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/outside/repository/service-account.json
```

Leave `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` unset when using the file option.
The root ID is the final segment of the chosen folder's Drive URL. Use the
project parent folder, rather than an individual project's folder or template.
Restart the backend after changing settings.

## Railway setup

In the backend service's Railway Variables, set:

- `GOOGLE_DRIVE_ROOT_FOLDER_ID` to the company project parent folder ID.
- `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` to the complete downloaded JSON content as
  a single variable value. Paste the JSON itself, without shell quotes around it.

Remove a local-only `GOOGLE_APPLICATION_CREDENTIALS` path and redeploy the service.
No database migration or committed key file is required. Roll back by removing the
new JSON variable and restoring the prior ADC/file configuration, then restarting.

## Read-only verification

Locally, with development dependencies installed, run `npm run check:drive` from
the backend directory. It prints safe connection metadata and exits with `0` for
`ready`, or `1` otherwise. This CLI needs neither the database nor a running app.

On a running backend, authenticate as a `system_admin` and call
`GET /project-drive/connection` using its bearer token. Other roles receive `403`;
anonymous callers receive `401`. The authenticated check returns HTTP `200` with
structured connection status even when Drive is unconfigured or unavailable.

`ready` means the folder exists, is not trashed, belongs to a Shared Drive, and
Google reports list, add, and trash-children capabilities. The result includes the
folder name/ID, Shared Drive ID, optional web link, capabilities, and
`writesTested: false`. It reads metadata only: it creates, uploads, and deletes
nothing. It does not prove a real upload/provision/delete succeeds or validate
all nested-folder permissions or organization policies.

Other statuses distinguish missing configuration, invalid/trashed folders,
unsupported My Drive locations, insufficient capabilities, authentication/access
failures, missing roots, and general API/network failures. A `403` from Google can
also mean the API is disabled or blocked by policy; `404` may mean the folder is
not visible to the service account. Check API enablement, the root ID, membership,
and credential configuration. No Google error bodies or credentials are returned.

Live company Drive verification is pending until credentials are supplied.
Existing template provisioning, browsing, and uploads use the same authentication.
This change does not add folder editing/deletion, existing-folder linking, or
customization of the template during project creation.
