# Apartment Drive folder repair

New building projects create a `דיירים` folder below their Drive root. New apartment projects create a project-name folder below that folder and receive the standard document template. Apartment folders do not receive another `דיירים` folder.

Older apartments may already have a linked Drive folder directly below the configured projects root. The repair API moves that same folder ID under the building's `דיירים` folder. Google Drive files, child folders, and links retain their IDs. It does not rename or delete the source folder.

The caller needs `drive.provision` permission and a bearer token. Review one apartment at a time:

1. Provision the building with `POST /project-drive/{buildingId}/provision`. This creates `דיירים` if it is missing.
2. Preview with `GET /project-drive/{apartmentId}/apartment-folder-repair`. This request only reads metadata. Review `sourceFolderId`, `destinationFolderId`, and `status` against the intended building and apartment.
3. Send `POST /project-drive/{apartmentId}/apartment-folder-repair` with the reviewed `sourceFolderId` and `destinationFolderId` as JSON. The API checks both IDs against a fresh preview before moving. It then provisions any missing apartment template folders.
4. Repeat the preview. `already_placed` confirms the linked folder is now directly under `דיירים`.

The repair rejects a source outside the legacy projects root, a missing or non-folder source, an unexpected parent, and a same-name destination folder. Resolve those conflicts manually after checking the Drive contents. Repeating a successful repair is safe. Do not run the repair against production or shared Drive without reviewing the preview and obtaining the appropriate operational approval.
