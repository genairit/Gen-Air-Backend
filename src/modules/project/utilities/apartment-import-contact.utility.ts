import {
  APARTMENT_IMPORT_COLUMNS,
  APARTMENT_IMPORT_VALIDATION,
} from '../constants/apartment-import.constant';

import { isEmail } from 'class-validator';
import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { FIELD_VALIDATION_REGEX } from '@Constants/field-validation.constant';

export const validateApartmentImportContacts = (
  cells: readonly string[],
): string[] => {
  return APARTMENT_IMPORT_COLUMNS.flatMap(({ validation, header }, index) => {
    const value = (cells[index] ?? '').trim();
    if (!value) {
      return [];
    }

    if (
      validation === APARTMENT_IMPORT_VALIDATION.PHONE &&
      !FIELD_VALIDATION_REGEX.ISRAELI_PHONE.test(value)
    ) {
      return [`${header}: מספר טלפון לא תקין`];
    }

    const invalidEmail = !isEmail(value) || value.length > FIELD_LENGTHS.EMAIL;
    if (validation === APARTMENT_IMPORT_VALIDATION.EMAIL && invalidEmail) {
      return [`${header}: כתובת דוא״ל לא תקינה`];
    }

    return [];
  });
};
