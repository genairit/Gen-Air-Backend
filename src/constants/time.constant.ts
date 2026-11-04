const SECOND_MS = 1000;
export const TIME_UNITS = {
  SECOND_MS,
  MINUTE_MS: 60 * SECOND_MS,
  DAY_MS: 24 * 60 * 60 * SECOND_MS,
} as const;
