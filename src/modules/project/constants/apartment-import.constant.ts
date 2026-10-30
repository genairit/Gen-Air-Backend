import { HTTP_ERROR_CODES } from '@Constants/http-error-code.constant';

export const APARTMENT_IMPORT = {
  SHEET: 'דירות',
  ERROR_HEADER: 'סיבה',
  TEMPLATE_ERROR: HTTP_ERROR_CODES.INVALID_TEMPLATE,
  MAX_ROWS: 10000,
  MAX_FILE_BYTES: 5 * 1024 * 1024,
  MAX_CELL_CHARACTERS: 1000,
  FALLBACK_MIME_TYPES: ['', 'application/octet-stream'],
  MIME_TYPE:
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  TEMPLATE_FILENAME: 'apartments-template.xlsx',
  REPORT_FILENAME: 'apartments-errors.xlsx',
} as const;

export const APARTMENT_IMPORT_VALIDATION = {
  PHONE: 'phone',
  EMAIL: 'email',
} as const;

export const APARTMENT_IMPORT_COLUMNS = [
  { key: 'floor', header: 'קומה', validation: null },
  { key: 'apartment', header: 'דירה', validation: null },
  { key: 'ownership', header: 'בעל קרקע בתמ״א / רוכש', validation: null },
  { key: 'customerName', header: 'שם לקוח', validation: null },
  {
    key: 'customerPhone',
    header: 'טלפון לקוח',
    validation: APARTMENT_IMPORT_VALIDATION.PHONE,
  },
  {
    key: 'customerEmail',
    header: 'דוא״ל לקוח',
    validation: APARTMENT_IMPORT_VALIDATION.EMAIL,
  },
  { key: 'contactName', header: 'איש קשר של הלקוח', validation: null },
  {
    key: 'contactPhone',
    header: 'טלפון איש קשר',
    validation: APARTMENT_IMPORT_VALIDATION.PHONE,
  },
  {
    key: 'contactEmail',
    header: 'דוא״ל איש קשר',
    validation: APARTMENT_IMPORT_VALIDATION.EMAIL,
  },
  { key: 'credit', header: 'מחיר זיכוי', validation: null },
  { key: 'customerType', header: 'סוג לקוח', validation: null },
  {
    key: 'customerTaxId',
    header: 'מספר מזהה לקוח (ח״פ / ת״ז)',
    validation: null,
  },
  { key: 'customerAddress', header: 'כתובת לקוח', validation: null },
] as const;

export const APARTMENT_IMPORT_HEADERS = APARTMENT_IMPORT_COLUMNS.map(
  ({ header }) => header,
);
