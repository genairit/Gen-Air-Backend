export const PAYMENT_TERMS = {
  OTHER: 'other',
  PREPAID: 'prepaid',
  MILESTONES_NET_60: 'milestones_net_60',
  INSTALLMENTS_10_60_30: 'installments_10_60_30',
  TWELVE_PREPAID_CHECKS: 'twelve_prepaid_checks',
} as const;

export type PaymentTermsType =
  (typeof PAYMENT_TERMS)[keyof typeof PAYMENT_TERMS];

export const PAYMENT_TERMS_VALUES: PaymentTermsType[] =
  Object.values(PAYMENT_TERMS);
