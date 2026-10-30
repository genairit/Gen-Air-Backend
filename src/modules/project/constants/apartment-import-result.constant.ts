export const APARTMENT_IMPORT_ROW_STATUS = {
  CREATED: 'created',
  EXISTING: 'existing',
  DUPLICATE: 'duplicate',
  ERROR: 'error',
} as const;

export type ApartmentImportRowStatusType =
  (typeof APARTMENT_IMPORT_ROW_STATUS)[keyof typeof APARTMENT_IMPORT_ROW_STATUS];
