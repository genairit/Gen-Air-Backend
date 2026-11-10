export const QUOTATION_PROJECT_ROLE = {
  PRIMARY: 'primary',
  SHARED: 'shared',
} as const;
export type QuotationProjectRoleType =
  (typeof QUOTATION_PROJECT_ROLE)[keyof typeof QUOTATION_PROJECT_ROLE];
export const MAX_SHARED_APARTMENTS = 2000;
export const QUOTATION_SHARING_MESSAGES = {
  NOT_APPROVED: 'אפשר לשתף עם דירות לאחר אישור ההצעה.',
  NOT_BUILDING: 'אפשר לשתף עם דירות רק הצעה שנוצרה בבניין',
  UNRELATED_APARTMENT: 'אפשר לשתף רק עם דירות של הבניין שבו נוצרה ההצעה',
  LINKS_CHANGED: 'השיתוף עם הדירות השתנה. יש לרענן את ההצעה ולנסות שוב',
  LINKS_LOCK_CONTEXT: 'יש להסיר את השיתוף עם הדירות לפני החלפת פרויקט או לקוח',
} as const;
