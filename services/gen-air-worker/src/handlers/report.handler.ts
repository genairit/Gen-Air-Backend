import type {
  IReportResult,
  IReportPayload,
} from '../interfaces/worker.interface.js';

import { JobError } from '../errors/job.error.js';
import { WORKER, JOB_ERROR } from '../constants/worker.constant.js';

export const renderReport = (payload: unknown): IReportResult => {
  if (!isReportPayload(payload)) {
    throw new JobError(JOB_ERROR.INVALID, false);
  }

  const csv = [payload.headers, ...payload.rows]
    .map((row) => row.map(escapeCell).join(','))
    .join('\r\n');
  const result = {
    csv: `${csv}\r\n`,
    rowCount: payload.rows.length,
    contentType: 'text/csv; charset=utf-8',
  };
  if (Buffer.byteLength(JSON.stringify(result)) > WORKER.MAX_RESULT_BYTES) {
    throw new JobError(JOB_ERROR.RESULT_TOO_LARGE, false);
  }

  return result;
};

const isStringRow = (value: unknown): value is string[] => {
  if (!Array.isArray(value) || value.length > WORKER.MAX_COLUMNS) {
    return false;
  }

  return value.every(
    (cell: unknown) =>
      typeof cell === 'string' && cell.length <= WORKER.MAX_CELL_LENGTH,
  );
};

const isReportPayload = (value: unknown): value is IReportPayload => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const keys = Object.keys(value);
  const hasOnlyReportFields =
    keys.length === 2 && keys.includes('headers') && keys.includes('rows');
  if (!hasOnlyReportFields || !('headers' in value) || !('rows' in value)) {
    return false;
  }

  const { rows, headers } = value;
  if (!isStringRow(headers) || headers.length === 0 || !Array.isArray(rows)) {
    return false;
  }

  return (
    rows.length <= WORKER.MAX_ROWS &&
    rows.every(
      (row: unknown) => isStringRow(row) && row.length === headers.length,
    )
  );
};

const escapeCell = (cell: string): string => {
  const couldBeFormula = /^[\s\uFEFF]*[=+@-]/u.test(cell);
  const safeCell = couldBeFormula ? `'${cell}` : cell;
  return `"${safeCell.replaceAll('"', '""')}"`;
};
