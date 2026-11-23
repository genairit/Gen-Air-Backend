export const PAYMENT_CONFIGURATION_LIMITS = {
  STAGES: 30,
  STAGE_TEXT: 300,
  TOTAL_PERCENT: 100,
} as const;

export const PAYMENT_CONFIGURATION_PATTERNS = {
  PERCENT: /^(?:100|[0-9]{1,2})(?:\.[0-9]{1,4})?$/,
} as const;

export const PAYMENT_CONFIGURATION_MESSAGES = {
  CONFLICT: 'נבחרו גם תנאי תשלום קבועים וגם שלבי תשלום',
  DESCRIPTION_REQUIRED: 'יש לתאר את מועד התשלום של כל שלב',
  INVALID_STAGE: 'יש להזין שלבי תשלום תקינים',
  CUSTOM_REQUIRED: 'יש להגדיר שלבי תשלום מותאמים אישית',
} as const;
