import { TIME_UNITS } from './time.constant';

export const OPENAI_MODELS = {
  GPT_5_4_MINI: 'gpt-5.4-mini',
  GPT_5_4_MINI_SNAPSHOT: 'gpt-5.4-mini-2026-03-17',
} as const;

export const OPENAI_GPT_5_4_MINI_PRICING = {
  INPUT_USD: 0.75,
  OUTPUT_USD: 4.5,
  CACHED_INPUT_USD: 0.075,
  TOKENS_PER_PRICE_UNIT: 1_000_000,
} as const;

export const OPENAI = {
  MAX_RETRIES: 1,
  FIRST_CHOICE_INDEX: 0,
  FUNCTION_TOOL_TYPE: 'function',
  MAX_COMPLETION_TOKENS: 4000,
  REQUEST_TIMEOUT_MS: 45 * TIME_UNITS.SECOND_MS,
} as const;
