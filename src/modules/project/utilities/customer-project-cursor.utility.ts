import {
  ICustomerProjectScope,
  ICustomerProjectCursor,
} from '../interfaces/customer-project.interface';

import { Op, WhereOptions } from 'sequelize';
import { isObject } from '@Utilities/object.utility';
import { isUUID, isISO8601, maxLength } from 'class-validator';
import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { CUSTOMER_PROJECT_PAGINATION } from '../constants/customer-project.constant';

const parseCursor = (value: string): unknown => {
  try {
    const decoded = Buffer.from(value, CUSTOMER_PROJECT_PAGINATION.ENCODING);
    if (decoded.toString(CUSTOMER_PROJECT_PAGINATION.ENCODING) !== value) {
      return null;
    }

    return JSON.parse(decoded.toString('utf8'));
  } catch {
    return null;
  }
};

export const decodeCustomerProjectCursor = (
  value: string,
  scope: ICustomerProjectScope,
): ICustomerProjectCursor | null => {
  const parsed = parseCursor(value);
  if (!isObject(parsed)) {
    return null;
  }

  const { id, name, updatedAt } = parsed;
  const hasId = typeof id === 'string' && isUUID(id);
  const hasName =
    typeof name === 'string' && maxLength(name, FIELD_LENGTHS.PROJECT_NAME);
  const hasDate =
    typeof updatedAt === 'string' && isISO8601(updatedAt, { strict: true });
  const hasScope =
    parsed.customerId === scope.customerId &&
    parsed.search === scope.search &&
    parsed.stageId === scope.stageId;
  if (!hasId || !hasName || !hasDate || !hasScope) {
    return null;
  }

  return {
    ...scope,
    id,
    name,
    updatedAt: new Date(updatedAt),
  };
};

export const encodeCustomerProjectCursor = (
  cursor: ICustomerProjectCursor,
): string =>
  Buffer.from(JSON.stringify(cursor)).toString(
    CUSTOMER_PROJECT_PAGINATION.ENCODING,
  );

export const buildCustomerProjectCursorWhere = (
  cursor: ICustomerProjectCursor | null,
): WhereOptions[] => {
  if (!cursor) {
    return [];
  }

  return [
    {
      [Op.or]: [
        { updatedAt: { [Op.lt]: cursor.updatedAt } },
        { updatedAt: cursor.updatedAt, name: { [Op.gt]: cursor.name } },
        {
          updatedAt: cursor.updatedAt,
          name: cursor.name,
          id: { [Op.gt]: cursor.id },
        },
      ],
    },
  ];
};
