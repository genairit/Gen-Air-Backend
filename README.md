# Gen-Air-Backend

the backend part of the gen air app

## Project Drive upload validation

`GET /project-drive/upload-policy` supplies the authenticated client with the
server's allowed extensions, signature rules, and limits. Both file-picker and
drag/drop selections pass client validation before a multipart request. The
server independently validates the whole batch before calling Drive, returns
`400` for rejected uploads, sends a canonical MIME type based on its own policy,
and removes temporary files on success or rejection (including parameter errors).

Supported: PDF; PNG, JPEG, GIF, WebP, TIFF, BMP; DOCX, XLSX, PPTX; UTF-8 text/CSV;
DWG and ASCII/binary DXF; and ZIP archives containing these supported files.
Executable/script extensions, misleading executable double extensions, unsafe
filenames and extension/signature mismatches are rejected. Browser-supplied MIME
headers are not trusted. Legacy Office formats, macros, ActiveX/OLE embeddings,
and unknown Office binary parts are not supported.

Limits: 20 files per request, 250 MiB per file, 50 MiB per ZIP/Office archive,
10 MiB per text/DXF file. Server archive inspection rejects encryption, unsafe
paths/symlinks, duplicate names, corrupt CRCs, more than 1,000 entries, expansion
over 100 MiB, compression ratios over 100:1, and nesting beyond three levels.
Nested archives share the outer archive's entry/expansion budget. Office packages
must contain their expected main XML part and content type; macro-related parts
and active-content declarations are rejected. Some otherwise legitimate documents
with unsupported embedded parts or unusually high compression will be rejected.

Client checks provide early feedback; ZIP/Office entry inspection is enforced on
the server. Signature/type checks do not fully parse every PDF/image/CAD format or
certify documents as malware-free. No antivirus engine is configured; malware
scanning/content sanitization would be an additional layer before production use.
Deploy the backend policy endpoint before the corresponding frontend change;
clients fail closed if that policy cannot be loaded. No new environment variable
or database migration is needed for upload validation.

## Frontend integration gate

The QA agent keeps its targeted and full feature verification before PRs. Backend PRs do not
trigger a GitHub Playwright run. Feature → dev relies on QA evidence and has no duplicate GitHub
suite; frontend promotions dev → test and test → main run against the matching backend destination.
Merge/promote backend dependencies into that destination before frontend verification.

Backend test/main pushes run `.github/workflows/refresh-frontend-gates.yml`, a lightweight notifier
that invalidates frontend promotion compatibility results and refreshes completed promotion checks.
It needs `FRONTEND_GATE_TOKEN` scoped to Gen-Air-Frontend: Pull requests read, Actions read/write,
Commit statuses read/write, Metadata read. It runs no Playwright and does not observe dev or refresh
feature gates. Recheck feature QA evidence manually after backend dev changes.
See Gen-Air-Automation `docs/release-gate-rollout.md` before changing required checks or deploying
this workflow. Releases must wait for backend promotion and notifier completion.
