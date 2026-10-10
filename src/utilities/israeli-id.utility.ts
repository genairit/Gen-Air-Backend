import { FIELD_VALIDATION_REGEX } from '@Constants/field-validation.constant';

const DECIMAL_BASE = 10;
const MAX_SINGLE_DIGIT = 9;
const DOUBLED_DIGIT_WEIGHT = 2;

const toCheckDigitContribution = (digit: number, index: number): number => {
  const isDoubledPosition = index % 2 === 1;
  const weighted = isDoubledPosition ? digit * DOUBLED_DIGIT_WEIGHT : digit;
  const isTwoDigitProduct = weighted > MAX_SINGLE_DIGIT;

  return isTwoDigitProduct ? weighted - MAX_SINGLE_DIGIT : weighted;
};

export const isValidIsraeliCompanyNumber = (value?: string | null): boolean => {
  if (!value || !FIELD_VALIDATION_REGEX.COMPANY_NUMBER.test(value)) {
    return false;
  }

  const checksum = [...value]
    .map(Number)
    .reduce(
      (sum, digit, index) => sum + toCheckDigitContribution(digit, index),
      0,
    );

  return checksum % DECIMAL_BASE === 0;
};
