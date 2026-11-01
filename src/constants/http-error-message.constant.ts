import {
  HTTP_ERROR_CODES,
  HttpErrorCodeType,
} from './http-error-code.constant';

export const HTTP_ERROR_MESSAGES = {
  [HTTP_ERROR_CODES.PROJECT_NAME_ALREADY_EXISTS]:
    'קיים כבר פרויקט בשם זה. יש לבחור שם אחר (ההשוואה תלוית רישיות)',
  [HTTP_ERROR_CODES.INVALID_TEMPLATE]: 'Invalid apartment import template',
  [HTTP_ERROR_CODES.CUSTOMER_NOT_FOUND]: 'Customer was not found',
  [HTTP_ERROR_CODES.CUSTOMER_CONTACT_NOT_FOUND]:
    'Contact was not found for this customer',
  [HTTP_ERROR_CODES.INVALID_CUSTOMER_CONTACT]:
    'Customer contact details are invalid',
  [HTTP_ERROR_CODES.DUPLICATE_CUSTOMER_CONTACT]:
    'An identical contact already exists for this customer',
  [HTTP_ERROR_CODES.APARTMENT_IMPORT_FILE_REQUIRED]:
    'One XLSX file is required',
  [HTTP_ERROR_CODES.APARTMENT_IMPORT_BUILDING_NOT_FOUND]:
    'Apartment import building was not found',
  [HTTP_ERROR_CODES.APARTMENT_IMPORT_BUILDING_INVALID]:
    'Apartment import requires an eligible residential building',
} as const satisfies Record<HttpErrorCodeType, string>;
