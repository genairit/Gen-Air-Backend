export const SHARED_DOCUMENT_STATUS = {
  NONE: 'none',
  AVAILABLE: 'available',
  UNAVAILABLE: 'unavailable',
} as const;

export type SharedDocumentStatusType =
  (typeof SHARED_DOCUMENT_STATUS)[keyof typeof SHARED_DOCUMENT_STATUS];
