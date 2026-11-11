export const MATERIAL_UNIT = {
  UNIT: 'unit',
  SET: 'set',
  METRE: 'm',
  SQUARE_METRE: 'sqm',
} as const;
export const MATERIAL_UNITS = Object.values(MATERIAL_UNIT);
export const MATERIAL_STATUS = {
  ACTIVE: 'active',
  NEEDS_SPEC: 'needs_spec',
  INACTIVE: 'inactive',
} as const;
export const MATERIAL_BASIS = {
  FIXED: 'fixed',
  CONDITIONAL: 'conditional',
  INCLUDED: 'included',
  PROJECT_MEASUREMENT: 'project_measurement',
} as const;
export const MATERIAL_STATUSES = Object.values(MATERIAL_STATUS);
export const MATERIAL_BASES = Object.values(MATERIAL_BASIS);

export type MaterialUnitType =
  (typeof MATERIAL_UNIT)[keyof typeof MATERIAL_UNIT];
export type MaterialStatusType =
  (typeof MATERIAL_STATUS)[keyof typeof MATERIAL_STATUS];
export type MaterialBasisType =
  (typeof MATERIAL_BASIS)[keyof typeof MATERIAL_BASIS];
