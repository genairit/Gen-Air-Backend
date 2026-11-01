import { isUUID, isISO8601 } from 'class-validator';
import { BadRequestException } from '@nestjs/common';
import { isObject } from '@Utilities/object.utility';
import type { GetQuotationsDto } from '../dto/get-quotations.dto';
import { QUOTATION_STATUSES } from '../constants/quotation.constant';
import type { IQuotationCursor } from '../interfaces/quotation-cursor.interface';

const parseQuotationCursor = (cursor: string): unknown => {
  try {
    const decoded = Buffer.from(cursor, 'base64url');
    if (decoded.toString('base64url') !== cursor) {
      throw new BadRequestException('סמן עמוד לא תקין');
    }
    return JSON.parse(decoded.toString('utf8'));
  } catch {
    throw new BadRequestException('סמן עמוד לא תקין');
  }
};

export const encodeQuotationCursor = (position: IQuotationCursor): string =>
  Buffer.from(JSON.stringify(position)).toString('base64url');
export const decodeQuotationCursor = (
  query: GetQuotationsDto,
): IQuotationCursor | null => {
  if (!query.batchCursor) {
    return null;
  }
  const data = parseQuotationCursor(query.batchCursor);
  if (
    !isObject(data) ||
    typeof data.id !== 'string' ||
    !isUUID(data.id) ||
    typeof data.updatedAt !== 'string' ||
    !isISO8601(data.updatedAt, { strict: true }) ||
    typeof data.search !== 'string' ||
    data.search !== (query.search ?? '').trim() ||
    data.status !== (query.status ?? null)
  ) {
    throw new BadRequestException('סמן העמוד אינו תקין למסננים שנבחרו');
  }
  const status =
    QUOTATION_STATUSES.find((value) => value === data.status) ?? null;
  return {
    id: data.id,
    updatedAt: data.updatedAt,
    search: data.search,
    status,
  };
};
