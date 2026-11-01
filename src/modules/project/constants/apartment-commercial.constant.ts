export const APARTMENT_OWNERSHIP = {
  LANDOWNER: 'landowner',
  BUYER: 'buyer',
} as const;

export type ApartmentOwnershipType =
  (typeof APARTMENT_OWNERSHIP)[keyof typeof APARTMENT_OWNERSHIP];

export const APARTMENT_OWNERSHIP_VALUES = Object.values(APARTMENT_OWNERSHIP);

export const APARTMENT_OWNERSHIP_OPTIONS = [
  { value: APARTMENT_OWNERSHIP.LANDOWNER, label: 'בעל קרקע בתמ״א' },
  { value: APARTMENT_OWNERSHIP.BUYER, label: 'רוכש' },
] as const;

export const APARTMENT_COMMERCIAL = {
  CREDIT_PATTERN: /^\d+(?:\.\d{1,2})?$/,
  CREDIT_MAX_LENGTH: 1000,
  CURRENCY: 'ILS',
} as const;
