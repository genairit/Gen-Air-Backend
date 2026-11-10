import {
  PAYMENT_TERMS,
  type PaymentTermsType,
} from '@Constants/payment-terms.constant';

export const QUOTATION_PDF_COMPANY = {
  name: 'ג׳נאייר מיזוג אוויר בע״מ',
  address: 'יעקב אליאב 3',
  city: 'ירושלים 95483',
  email: 'office@genair.co.il',
  phone: '02-940-1100',
  businessNumber: '515772564',
  vatFileNumber: '515772564',
} as const;

export const PAYMENT_TERM_LABELS: Record<PaymentTermsType, string> = {
  [PAYMENT_TERMS.OTHER]: 'לפי תנאים מותאמים אישית',
  [PAYMENT_TERMS.PREPAID]: 'תשלום אחד מראש לפני תחילת העבודה',
  [PAYMENT_TERMS.MILESTONES_NET_60]: 'לפי אבני דרך, שוטף + 60',
  [PAYMENT_TERMS.INSTALLMENTS_10_60_30]: 'תשלום בשלבים: 10%–60%–30%',
  [PAYMENT_TERMS.TWELVE_PREPAID_CHECKS]: '12 שיקים במעמד ההזמנה',
};
