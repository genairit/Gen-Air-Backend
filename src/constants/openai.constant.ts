import { TIME_UNITS } from './time.constant';

export const OPENAI = {
  MAX_RETRIES: 1,
  FIRST_CHOICE_INDEX: 0,
  FUNCTION_TOOL_TYPE: 'function',
  MAX_COMPLETION_TOKENS: 4000,
  REQUEST_TIMEOUT_MS: 45 * TIME_UNITS.SECOND_MS,
} as const;
