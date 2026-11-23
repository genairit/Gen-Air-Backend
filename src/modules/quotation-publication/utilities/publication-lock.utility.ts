export const publicationQuotationLockKey = (quotationId: string): string =>
  `quotation-publication:${quotationId}`;
export const publicationProjectLockKey = (projectId: string): string =>
  `quotation-publication-folder:${projectId}`;
