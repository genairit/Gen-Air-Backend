import { isString, ValidateBy } from 'class-validator';
import { decodeCursor } from '@Utilities/cursor-pagination.utility';

export const IsCursor = () =>
  ValidateBy({
    name: 'isCursor',
    validator: {
      validate: (value: unknown) =>
        isString(value) && decodeCursor(value) != null,
      defaultMessage: () =>
        'batchCursor must be a cursor returned by a previous page',
    },
  });
