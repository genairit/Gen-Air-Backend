import { ValidateBy } from 'class-validator';
import { isValidIsraeliCompanyNumber } from '@Utilities/israeli-id.utility';

export const IsIsraeliCompanyNumber = () =>
  ValidateBy({
    name: 'isIsraeliCompanyNumber',
    validator: {
      validate: (value: unknown) =>
        typeof value === 'string' && isValidIsraeliCompanyNumber(value),
      defaultMessage: (validationArguments) =>
        `${validationArguments?.property ?? 'value'} must be a 9-digit Israeli registration number with a valid check digit`,
    },
  });
