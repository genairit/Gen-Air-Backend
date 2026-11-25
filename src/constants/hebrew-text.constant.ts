import { TEXT } from './text.constant';

export const HEBREW_TEXT = {
  LINE_BREAK: TEXT.LINE_BREAK,
  FINAL_LETTERS: 'ךםןףץ',
  NON_FINAL_COUNTERPARTS: 'כמנפצ',
  WORD_PATTERN: /[\u05D0-\u05EA]{2,}/g,
  MIRRORED_CHARACTER_PATTERN: /[()[\]{}<>]/g,
  LEFT_TO_RIGHT_RUN_PATTERN:
    /[A-Za-z0-9](?:[A-Za-z0-9.,:/\-_%@]*[A-Za-z0-9])?/g,
} as const;

export const MIRRORED_CHARACTERS: Readonly<Record<string, string>> = {
  '(': ')',
  ')': '(',
  '[': ']',
  ']': '[',
  '{': '}',
  '}': '{',
  '<': '>',
  '>': '<',
};
