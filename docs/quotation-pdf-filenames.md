# Quotation and order PDF filenames

New manual exports and newly captured publication operations use `quotation-filename.v2`:

`{document_name} - {document_number} - {customer_name} - {project_name} - {building_apartment} - {hvac_brands}.pdf`

The Backend quotation filename utility is the only naming authority. The existing shared PDF snapshot capture resolves both the rendered recipient and filename recipient, falling back from a blank project override to the customer name. It uses the saved quotation number, canonical primary project name and already-loaded live parent building name. An apartment context is `בנין {parent name} דירה {apartment number}`; missing optional parts are omitted. Brands retain saved order, normalize/deduplicate after sanitization and join with `+`.

Fields preserve NFC Unicode and safe underscores while replacing filesystem-reserved characters, controls and formatting controls. Names are bounded to 240 UTF-8 bytes, including `.pdf`, at grapheme boundaries. Truncation preserves document kind/number, distributes the remaining budget across optional fields and adds a deterministic 12-hex SHA-256 suffix to the number, based on full normalized inputs and stable quotation identity. Compound labels and brand separators are emitted only with remaining values. Pathological required identities that cannot fit are rejected.

The existing publication snapshot stores policy, normalized inputs, final filename and source hash once. Retry and reconciliation use that persisted filename; queued/archived v1 snapshots are not recomputed. Review-to-order updates the existing bound Drive file's actual order media, name and folder through the publication protocol. Withdrawal preserves its last published name and bytes in the archive. No historical sweep or unrelated upload/planning-file rename occurs.

Browser downloads use the server's UTF-8 Content-Disposition filename without a local fallback. Manual export does not publish to Drive. Existing execution emails retain the selected plan and ZIP names and do not gain a quotation attachment.

No schema, environment variable or Worker deployment change is required for this policy revision. Deploy the Backend change before its frontend release; keep task 186's publication schema and environment prerequisites. Rollback must retain persisted outputs rather than reconstruct old queued names.
