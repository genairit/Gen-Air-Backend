export const APARTMENT_IMPORT_ROW = {
  FLOOR_PATTERN: /^-?\d+$/,
  FIELD_KEYS: {
    customerFloor: 'floor',
    customerApartment: 'apartment',
    apartmentOwnership: 'ownership',
    apartmentCredit: 'credit',
  },
} as const;
