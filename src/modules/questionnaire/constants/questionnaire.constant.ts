import { TIME_UNITS } from '@Constants/time.constant';

export const QUESTIONNAIRE_LIMITS = {
  WINDOW_MS: TIME_UNITS.MINUTE_MS,
  READS_PER_WINDOW: 300,
  SUBMISSIONS_PER_WINDOW: 60,
  MAX_CLIENTS: 10000,
  TOTAL_READS_PER_WINDOW: 10000,
  TOTAL_SUBMISSIONS_PER_WINDOW: 5000,
  MAX_BODY_BYTES: 64 * 1024,
  ANSWER_COUNT: 7,
} as const;

export const QUESTIONNAIRE_FIELD_TYPES = {
  IDENTITY: 'identity',
  LONG_TEXT: 'long-text',
} as const;
export type QuestionnaireFieldType =
  (typeof QUESTIONNAIRE_FIELD_TYPES)[keyof typeof QUESTIONNAIRE_FIELD_TYPES];
