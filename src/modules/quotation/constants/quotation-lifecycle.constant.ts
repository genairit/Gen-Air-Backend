export const QUOTATION_LIFECYCLE_ACTION = {
  SUBMIT: 'submit',
  APPROVE: 'approve',
  RETURN: 'return',
  REJECT: 'reject',
  RESUBMIT: 'resubmit',
  CANCEL: 'cancel',
  RESTORE: 'restore',
} as const;

export type QuotationLifecycleActionType =
  (typeof QUOTATION_LIFECYCLE_ACTION)[keyof typeof QUOTATION_LIFECYCLE_ACTION];
