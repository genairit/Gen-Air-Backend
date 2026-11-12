export const PROJECT_BOQ_BASIS = {
  FIXED: 'fixed',
  CONDITIONAL: 'conditional',
  MEASUREMENT: 'project_measurement',
  MANUAL: 'manual',
} as const;
export const PROJECT_BOQ_REVIEW = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
} as const;
export const PROJECT_BOQ_QUANTITY_PATTERN = /^\d{1,8}(?:\.\d{1,8})?$/;
export const PROJECT_BOQ_COST_PATTERN = /^\d{1,12}(?:\.\d{1,4})?$/;
