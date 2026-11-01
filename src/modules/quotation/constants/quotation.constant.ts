import Decimal from 'decimal.js';

export const QUOTATION_STATUS = {
  DRAFT: 'draft',
  REVIEW: 'review',
  APPROVED: 'approved',
} as const;
export const SYSTEM_TYPE = {
  VRF: 'VRF',
  MULTI: 'MULTI',
  SINGLE: 'SINGLE',
  GENERAL: 'GEN',
} as const;
export const EQUIPMENT_ROLE = {
  INDOOR: 'indoor',
  OUTDOOR: 'outdoor',
  UNIT: 'unit',
  CONTROL: 'control',
  CENTRAL: 'central',
  HEADER: 'header',
  PIPE: 'pipe',
  OTHER: 'other',
} as const;
export const CATALOGUE_STATUS = {
  ACTIVE: 'active',
  ARCHIVED: 'archived',
  NO_SELL: 'nosell',
  CONFLICT: 'conflict',
} as const;
export const CONTROL_KIND = {
  REMOTE: 'remote',
  THERMOSTAT: 'thermostat',
} as const;
export const CATALOGUE_PREFERENCE = {
  USED: 'used',
  LESS: 'less',
  NEUTRAL: '',
} as const;
export const QUOTATION_STATUSES = Object.values(QUOTATION_STATUS);
export type TQuotationStatus =
  (typeof QUOTATION_STATUS)[keyof typeof QUOTATION_STATUS];
export const SYSTEM_TYPES = Object.values(SYSTEM_TYPE);
export type TSystemType = (typeof SYSTEM_TYPE)[keyof typeof SYSTEM_TYPE];
export const EQUIPMENT_ROLES = Object.values(EQUIPMENT_ROLE);
export const CATALOGUE_STATUSES = Object.values(CATALOGUE_STATUS);
export const MAX_SECTIONS = 50;
export const MAX_ITEMS_PER_SECTION = 200;
export const DEFAULT_VAT_RATE = '18';
export const QUOTATION_DECIMAL = Decimal.clone({
  precision: 50,
  rounding: Decimal.ROUND_HALF_UP,
});
