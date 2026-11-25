export const TEXT = {
  LINE_BREAK: '\n',
} as const;

export const TEXT_PATTERNS = {
  ANY_WHITESPACE: /\s/g,
  FILE_EXTENSION: /\.[^.]+$/,
  HORIZONTAL_WHITESPACE: /[^\S\n]+/g,
} as const;
