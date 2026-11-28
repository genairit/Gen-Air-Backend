# Quotation floor grouping

Apply the companion SQL migration before deploying the Backend. Deploy the quotation floor rendering change to the PDF Worker before enabling the new editor so printed quotations show floor and company headings.

Existing sections start without a floor. The editor can assign or rename a floor on an editable quotation. Section display order stores the order used when reading and printing. A floor ID identifies one floor within a single quotation. Renaming it updates its sections in the same versioned save.
