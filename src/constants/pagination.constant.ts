export const PAGINATION = {
  MAX_BATCH_SIZE: 200,
  DEFAULT_BATCH_SIZE: 50,
} as const;

export const CURSOR_DIRECTIONS = {
  NEWEST_FIRST: 'newest_first',
  OLDEST_FIRST: 'oldest_first',
} as const;

export type CursorDirectionType =
  (typeof CURSOR_DIRECTIONS)[keyof typeof CURSOR_DIRECTIONS];
