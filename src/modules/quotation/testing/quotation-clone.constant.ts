import { QUOTATION_BRANDS } from '../constants/quotation.constant';

export const CLONE_TEST_BRAND = {
  SOURCE: QUOTATION_BRANDS[0],
  TARGET: QUOTATION_BRANDS[1],
  OTHER: QUOTATION_BRANDS[4],
  GENERAL: '',
} as const;
export const CLONE_TEST_SCENARIO = {
  MISSING_SOURCE: 'missing-source',
  MULTI_BRAND: 'multi-brand',
  GENERAL_ONLY: 'general-only',
  CONTRADICTORY_SOURCE: 'contradictory-source',
  INVALID_ACCESSORY: 'invalid-accessory',
} as const;
export const CLONE_TEST_SKU = {
  SOURCE: 'SOURCE',
  TARGET: 'TARGET',
  GENERAL: 'GENERAL',
  FIRST: 'AAA',
  REMOTE_SOURCE: 'REMOTE-SOURCE',
  REMOTE_TARGET: 'REMOTE-TARGET',
  COMPATIBLE: 'ZZZ-COMPATIBLE',
} as const;
export const CLONE_TEST_EQUIPMENT_TYPE = { WALL: 'wall' } as const;
