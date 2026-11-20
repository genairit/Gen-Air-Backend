export const PURCHASE_RECORD_STATUS = {
  DRAFT: 'draft',
  REQUESTED: 'requested',
  REVIEWED: 'reviewed',
  APPROVED: 'approved',
  ORDERED: 'ordered',
  CANCELLED: 'cancelled',
} as const;

export const PURCHASE_RECORD_ACTION = {
  CREATE: 'create',
  TRANSITION: 'transition',
  CORRECT: 'correct',
} as const;

export const PURCHASE_QUANTITY_PATTERN = /^\d{1,8}(?:\.\d{1,8})?$/;

export const PURCHASE_CURRENCY = { ILS: 'ILS' } as const;
