import {
  IApartmentImportResult,
  IApartmentImportRowResult,
  IApartmentImportSkippedRow,
} from '../interfaces/apartment-import-result.interface';

import { createApartmentErrorReport } from './apartment-import-workbook.utility';
import { APARTMENT_IMPORT_ROW_STATUS } from '../constants/apartment-import-result.constant';

export const buildApartmentImportResult = async (
  results: readonly IApartmentImportRowResult[],
): Promise<IApartmentImportResult> => {
  const counts = {
    [APARTMENT_IMPORT_ROW_STATUS.CREATED]: 0,
    [APARTMENT_IMPORT_ROW_STATUS.EXISTING]: 0,
    [APARTMENT_IMPORT_ROW_STATUS.DUPLICATE]: 0,
    [APARTMENT_IMPORT_ROW_STATUS.ERROR]: 0,
  };
  results.forEach(({ status }) => {
    counts[status] += 1;
  });
  const skipped = results.filter(
    (row): row is IApartmentImportRowResult & IApartmentImportSkippedRow =>
      row.status !== APARTMENT_IMPORT_ROW_STATUS.CREATED,
  );
  const rows = skipped.map(({ reason, apartment, rowNumber, status }) => ({
    reason,
    status,
    apartment,
    rowNumber,
  }));
  if (skipped.length === 0) {
    return { rows, counts, reportBase64: null };
  }

  const report = await createApartmentErrorReport(skipped);
  return { rows, counts, reportBase64: report.toString('base64') };
};
