import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { FIELD_VALIDATION_REGEX } from '@Constants/field-validation.constant';

export const toDialablePhone = (value: string): string | null => {
  const trimmed = value.trim();
  if (trimmed.length > FIELD_LENGTHS.PHONE) {
    return null;
  }
  const isIsraeliLocal = FIELD_VALIDATION_REGEX.ISRAELI_PHONE.test(
    trimmed.replace(/[\s().-]/g, ''),
  );
  const isInternational = /^\+[1-9][\d\s().-]+$/.test(trimmed);
  if (!isIsraeliLocal && !isInternational) {
    return null;
  }

  const phone = parsePhoneNumberFromString(trimmed, 'IL');
  return phone?.isValid() ? phone.number : null;
};
