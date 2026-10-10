import { TIME_UNITS } from '@Constants/date';

export const SESSION_DURATION_SECONDS = {
  STANDARD: (12 * TIME_UNITS.HOURS) / TIME_UNITS.SECONDS,
  REMEMBERED: (30 * TIME_UNITS.DAYS) / TIME_UNITS.SECONDS,
} as const;

export const BEARER_PREFIX = 'Bearer ';
