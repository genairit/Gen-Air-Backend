import {
  APARTMENT_IMPORT,
  APARTMENT_IMPORT_HEADERS,
} from '../constants/apartment-import.constant';

import { Workbook } from 'exceljs';
import { Readable } from 'node:stream';
import { buildApartmentImportResult } from './apartment-import-result.utility';
import { APARTMENT_IMPORT_ROW_STATUS } from '../constants/apartment-import-result.constant';

describe('apartment import result', () => {
  it('returns zero counts and no report for an empty workbook', async () => {
    expect(await buildApartmentImportResult([])).toEqual({
      counts: { created: 0, existing: 0, duplicate: 0, error: 0 },
      rows: [],
      reportBase64: null,
    });
  });

  it('counts every status and reports only skipped rows with original fields', async () => {
    const results = Object.values(APARTMENT_IMPORT_ROW_STATUS).map(
      (status, index) => ({
        status,
        rowNumber: index + 2,
        apartment: String(index + 1),
        reason: `reason-${status}`,
        cells: APARTMENT_IMPORT_HEADERS.map(
          (_, field) => `original-${index}-${field}`,
        ),
      }),
    );
    const summary = await buildApartmentImportResult(results);
    expect(summary.counts).toEqual({
      created: 1,
      existing: 1,
      duplicate: 1,
      error: 1,
    });
    expect(summary.rows).toHaveLength(3);
    expect(summary.rows[0].rowNumber).toBe(3);
    expect(summary.rows[0]).not.toHaveProperty('cells');
    expect(summary.reportBase64).not.toBeNull();
    const workbook = new Workbook();
    await workbook.xlsx.read(
      Readable.from([Buffer.from(summary.reportBase64 ?? '', 'base64')]),
    );
    const sheet = workbook.getWorksheet(APARTMENT_IMPORT.SHEET);
    expect(sheet?.rowCount).toBe(4);
    expect(sheet?.getRow(2).getCell(1).value).toBe('original-1-0');
    expect(
      sheet?.getRow(2).getCell(APARTMENT_IMPORT_HEADERS.length + 1).value,
    ).toBe('reason-existing');
  });

  it('does not create an error report when all rows succeeded', async () => {
    const summary = await buildApartmentImportResult([
      {
        cells: [],
        reason: '',
        rowNumber: 2,
        apartment: '1',
        status: APARTMENT_IMPORT_ROW_STATUS.CREATED,
      },
    ]);
    expect(summary.counts.created).toBe(1);
    expect(summary.rows).toEqual([]);
    expect(summary.reportBase64).toBeNull();
  });
});
