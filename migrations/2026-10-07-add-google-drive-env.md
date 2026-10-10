# Add Google Drive settings

Date: 2026-10-07

## What to add

- `GOOGLE_DRIVE_ROOT_FOLDER_ID` — optional. Without it the server runs, but new projects get no
  Drive folders and the `/project-drive` endpoints answer `503`.
- `GOOGLE_APPLICATION_CREDENTIALS` — required together with the folder ID, unless the server runs
  on Google Cloud with an attached service account.

## Why

Every project gets its own Drive folder, built from the folder template in Settings when the
project is created. The project page lists those folders and files and uploads into them.

## Value

- `GOOGLE_DRIVE_ROOT_FOLDER_ID`: the ID of the Drive folder that will hold all project folders —
  the last part of its URL, for example `1AbCdEfGhIjKlMnOpQrStUvWxYz012345`. A folder in a Shared
  Drive is recommended, so files belong to the company and not to a single person.
- `GOOGLE_APPLICATION_CREDENTIALS`: the path to a service-account JSON key file, for example
  `/etc/gen-air/drive-service-account.json`. Never commit the key file.

## One-time setup in Google

1. Enable the Google Drive API in a Google Cloud project and create a service account there.
2. Add the service account's email as a **Content manager** of the Shared Drive (or give it Editor
   access to the root folder).
3. Projects created before Drive was configured can get their folders with
   `POST /project-drive/:projectId/provision`.
