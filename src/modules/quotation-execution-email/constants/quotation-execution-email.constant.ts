export const QUOTATION_EMAIL_STATUS = {
  PREPARING: 'preparing',
  SENDING: 'sending',
  SENT: 'sent',
  FAILED: 'failed',
  UNCERTAIN: 'uncertain',
} as const;

export type QuotationEmailStatusType =
  (typeof QUOTATION_EMAIL_STATUS)[keyof typeof QUOTATION_EMAIL_STATUS];

export const QUOTATION_EMAIL_LIMITS = {
  MAX_RECIPIENTS: 20,
  MAX_PLAN_VERSION: 80,
  MAX_FILE_BYTES: 15 * 1024 * 1024,
  MAX_TOTAL_BYTES: 24 * 1024 * 1024,
  PREPARATION_LEASE_MS: 30 * 60 * 1000,
} as const;
