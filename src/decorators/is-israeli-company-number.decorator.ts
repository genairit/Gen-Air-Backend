import { ValidateBy } from 'class-validator';
import { isValidIsraeliCompanyNumber } from '@Utilities/israeli-id.utility';

export const IsIsraeliCompanyNumber = () =>
  ValidateBy({
    name: 'isIsraeliCompanyNumber',
    validator: {
      validate: (value: unknown) =>
        typeof value === 'string' && isValidIsraeliCompanyNumber(value),
      defaultMessage: () =>
        'customerCompanyNumber must be a 9-digit ח.פ / ת.פ with a valid check digit',
    },
  });
