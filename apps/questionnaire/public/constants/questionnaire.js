export const FIELD_TYPES = { IDENTITY: 'identity', LONG_TEXT: 'long-text' };
export const QUESTIONNAIRE_LIMITS = { BODY_BYTES: 64 * 1024, ANSWER_COUNT: 7 };
export const IDENTITY_KEYS = ['fullName', 'role', 'department'];
export const ANSWER_KEYS = Array.from(
  { length: QUESTIONNAIRE_LIMITS.ANSWER_COUNT },
  (_, index) => `answer${index + 1}`,
);
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
