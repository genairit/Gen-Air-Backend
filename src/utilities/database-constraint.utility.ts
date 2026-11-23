import { DatabaseError } from 'sequelize';
import { isObject } from './object.utility';

export const isDatabaseCheckConstraint = (
  error: unknown,
  constraint: string,
): boolean => {
  if (!(error instanceof DatabaseError) || !isObject(error.parent)) {
    return false;
  }

  return (
    Reflect.get(error.parent, 'code') === '23514' &&
    Reflect.get(error.parent, 'constraint') === constraint
  );
};
