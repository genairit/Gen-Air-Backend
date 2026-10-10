import { WhereOptions } from 'sequelize';

const LIKE_SPECIAL_CHARACTERS = /[\\%_]/g;

export const toContainsPattern = (value: string): string => {
  const escapedValue = value.replace(LIKE_SPECIAL_CHARACTERS, '\\$&');

  return `%${escapedValue}%`;
};

export const whereWhenPresent = <TValue, TModel>(
  value: TValue | null,
  buildWhere: (presentValue: TValue) => WhereOptions<TModel>,
): WhereOptions<TModel>[] => {
  if (value == null) {
    return [];
  }

  return [buildWhere(value)];
};
