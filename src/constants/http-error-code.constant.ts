export const HTTP_ERROR_CODES = {
  INVALID_TEMPLATE: 'INVALID_TEMPLATE',
} as const;

export type HttpErrorCodeType =
  (typeof HTTP_ERROR_CODES)[keyof typeof HTTP_ERROR_CODES];

export const HTTP_ERROR_CODE_VALUES = Object.values(HTTP_ERROR_CODES);
