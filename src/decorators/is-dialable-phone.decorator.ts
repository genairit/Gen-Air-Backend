import { ValidateBy, buildMessage } from 'class-validator';
import { toDialablePhone } from '@Utilities/phone.utility';

export const IsDialablePhone = () =>
  ValidateBy({
    name: 'isDialablePhone',
    validator: {
      validate: (value: unknown) =>
        typeof value === 'string' && toDialablePhone(value) !== null,
      defaultMessage: buildMessage(
        (eachPrefix) =>
          `${eachPrefix}$property must be a valid Israeli or +international phone number`,
        { each: false },
      ),
    },
  });
