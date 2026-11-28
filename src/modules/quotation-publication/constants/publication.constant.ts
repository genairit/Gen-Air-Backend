import { TIME_UNITS } from '@Constants/time.constant';

export const PUBLICATION_STATE = {
  UNTRACKED: 'untracked',
  NOT_APPLICABLE: 'not_applicable',
  QUEUED: 'queued',
  RENDERING: 'rendering',
  PUBLISHING: 'publishing',
  ARCHIVING: 'archiving',
  RECONCILING: 'reconciling',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
  FAILED: 'failed',
} as const;
export type PublicationStateType =
  (typeof PUBLICATION_STATE)[keyof typeof PUBLICATION_STATE];
export const PUBLICATION_KIND = {
  QUOTATION: 'quotation',
  ORDER: 'order',
} as const;
export type PublicationKindType =
  (typeof PUBLICATION_KIND)[keyof typeof PUBLICATION_KIND];
export const PUBLICATION_ROLE = {
  QUOTATION: 'quotation',
  ORDER: 'order',
  ARCHIVE: 'archive',
  BOQ: 'boq',
} as const;
export type PublicationRoleType =
  (typeof PUBLICATION_ROLE)[keyof typeof PUBLICATION_ROLE];
export const PUBLICATION_LIMITS = {
  PDF_BYTES: 4 * 1024 * 1024,
  JOB_BYTES: 1024 * 1024,
  RESULT_BYTES: 6 * 1024 * 1024,
  POLL_MS: 5 * TIME_UNITS.SECOND_MS,
  HTTP_TIMEOUT_MS: 110 * TIME_UNITS.SECOND_MS,
  RENDER_TIMEOUT_MS: 5 * TIME_UNITS.MINUTE_MS,
  DRIVE_TIMEOUT_MS: 40 * TIME_UNITS.SECOND_MS,
} as const;
export const PUBLICATION_POLICY = {
  RENDERER: 'quotation.pdf.v1',
  FILENAME: 'quotation-filename.v2',
  TENANT: 'genair',
} as const;
export const PUBLICATION_REASON = {
  SUPERSEDED: 'ההפקה בוטלה לפני יצירת קובץ',
  NO_PROJECT: 'אין פרויקט מקושר לפרסום הקובץ',
  DESTINATION: 'יש להשלים או לתקן את תיקיות הפרויקט ב-Drive',
  WORKER: 'הפקת הקובץ נכשלה. ניתן לנסות שוב',
  TIMEOUT: 'הפקת הקובץ לא הושלמה בזמן. ניתן לנסות שוב',
  DRIVE: 'שמירת הקובץ ב-Drive לא הושלמה. ניתן לנסות שוב',
  RECONCILING: 'מתבצעת בדיקה של שמירת הקובץ ב-Drive',
  COMPLETION_REQUIRED: 'יש להשלים את תבנית התיקיות של הפרויקט המקושר',
  AMBIGUOUS: 'נמצאו תיקיות כפולות. יש לתקן את תיקיות הפרויקט',
  APARTMENT: 'יש לבדוק ולתקן את מיקום תיקיית הדירה',
  MISSING: 'הקובץ או התיקייה אינם זמינים. יש לבדוק את ההרשאות ב-Drive',
} as const;

export const PUBLICATION_RESULT_STATUS = {
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
} as const;
export type PublicationResultStatusType =
  (typeof PUBLICATION_RESULT_STATUS)[keyof typeof PUBLICATION_RESULT_STATUS];

export const PUBLICATION_BROKER_EVENT = {
  ERROR: 'error',
  CLOSE: 'close',
  RETURN: 'return',
} as const;
export const PUBLICATION_PROTOCOL = {
  VERSION: 1,
  CONTENT_TYPE: 'application/json',
  QUEUE_TYPE: 'quorum',
  AMQP_SCHEME: 'amqp:',
  AMQPS_SCHEME: 'amqps:',
} as const;
