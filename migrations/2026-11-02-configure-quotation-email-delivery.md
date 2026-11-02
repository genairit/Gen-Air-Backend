# Configure optional quotation completion email delivery

Date: 2026-11-02

The quotation execution email endpoint stays disabled unless `EMAIL_DELIVERY_MODE` is set. Apply `2026-11-02-add-quotation-execution-email.sql` before deploying the backend that uses it. The GenAir sidebar logo is copied into the backend build as an inline email image; no image URL is needed.

| Variable | Required when enabled | Purpose / example shape |
| --- | --- | --- |
| `EMAIL_DELIVERY_MODE` | Yes | `disabled` (default), `allowlist`, or `live`. `live` requires `NODE_ENV=production`. |
| `EMAIL_ALLOWED_RECIPIENTS` | In allowlist mode | Comma-separated exact test email addresses, e.g. `qa@example.test,designer@example.test`. Every recipient must match. |
| `SMTP_HOST` | Yes | SMTP host, e.g. `smtp.example.test`. |
| `SMTP_PORT` | Yes | SMTP port, e.g. `587` or `465`. |
| `SMTP_SECURE` | No | `true` for TLS on connect; port 465 also enables it. |
| `SMTP_USER` | With `SMTP_PASSWORD` | SMTP username; omit both for a trusted local relay. |
| `SMTP_PASSWORD` | With `SMTP_USER` | SMTP password; keep only in the deployment secret store. |
| `SMTP_FROM` | Yes | Mailbox email address, e.g. `projects@example.test`. Reply-To uses the logged-in sender's email. |

Nonproduction should use `allowlist` with test addresses. Do not enable `live` for QA. A configured SMTP transport does not send on task completion: the user must select contacts and Drive files, then explicitly send.

Each task has one delivery record. `sent` and `sending` attempts are never automatically retried. A transport failure is marked `uncertain` because SMTP acceptance may have occurred; reconcile it with the provider before another send. A preparation failure is `failed` and can be explicitly retried with a new request ID. The quotation task remains completed in every case.
