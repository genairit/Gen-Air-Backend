import {
  readApartmentWorkbook,
  createApartmentTemplate,
  createApartmentErrorReport,
} from './apartment-import-workbook.utility';

import {
  APARTMENT_IMPORT,
  APARTMENT_IMPORT_HEADERS,
} from '../constants/apartment-import.constant';

import { Readable } from 'node:stream';
import { CellValue, Workbook } from 'exceljs';
import { UnprocessableEntityException } from '@nestjs/common';

const makeFile = async (
  rows: CellValue[][] = [],
  headers: CellValue[] = [...APARTMENT_IMPORT_HEADERS],
  name: string = APARTMENT_IMPORT.SHEET,
) => {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet(name);
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row));
  return {
    name: 'apartments.xlsx',
    mimeType: APARTMENT_IMPORT.MIME_TYPE,
    bytes: Buffer.from(await workbook.xlsx.writeBuffer()),
  };
};

const readWorkbook = async (bytes: Buffer): Promise<Workbook> => {
  const workbook = new Workbook();
  await workbook.xlsx.read(Readable.from([bytes]));
  return workbook;
};

const exampleRow = (): string[] => [
  '2',
  '003א',
  'רוכש',
  'לקוח לדוגמה',
  '0501234567',
  'customer@example.com',
  'איש קשר',
  '0521234567',
  'contact@example.com',
  '120.50',
  'לקוח פרטי',
  '123456782',
  'רחוב לדוגמה 1',
];

describe('apartment workbook boundary', () => {
  it('creates a Hebrew RTL template with exactly the approved expanded headers', async () => {
    const bytes = await createApartmentTemplate();
    const workbook = await readWorkbook(bytes);
    const sheet = workbook.getWorksheet(APARTMENT_IMPORT.SHEET);
    expect(
      APARTMENT_IMPORT_HEADERS.map(
        (_, index) => sheet?.getRow(1).getCell(index + 1).value,
      ),
    ).toEqual(APARTMENT_IMPORT_HEADERS);
    expect(sheet?.views[0].rightToLeft).toBe(true);
    expect(APARTMENT_IMPORT_HEADERS).toHaveLength(13);
    expect(APARTMENT_IMPORT_HEADERS).not.toContain('בניין');
    expect(
      await readApartmentWorkbook({
        bytes,
        name: 'template.xlsx',
        mimeType: APARTMENT_IMPORT.MIME_TYPE,
      }),
    ).toEqual([]);
  });

  it('preserves all original text, row numbers and leading-zero identifiers', async () => {
    const row = exampleRow();
    const file = await makeFile([row, [], row]);
    const parsed = await readApartmentWorkbook(file);
    expect(parsed).toEqual([
      { rowNumber: 2, cells: row, errors: [] },
      { rowNumber: 4, cells: row, errors: [] },
    ]);
  });

  it('does not silently decide required row fields', async () => {
    const parsed = await readApartmentWorkbook(await makeFile([['2']]));
    expect(parsed[0].cells).toEqual([
      '2',
      ...Array<string>(APARTMENT_IMPORT_HEADERS.length - 1).fill(''),
    ]);
    expect(parsed[0].errors).toEqual([]);
  });

  it.each([
    APARTMENT_IMPORT_HEADERS.slice(0, -1),
    [...APARTMENT_IMPORT_HEADERS].reverse(),
    [...APARTMENT_IMPORT_HEADERS, 'אחראית'],
    ['building', ...APARTMENT_IMPORT_HEADERS.slice(1)],
  ])(
    'rejects incompatible headers with 422 INVALID_TEMPLATE',
    async (...headers) => {
      const file = await makeFile([], headers);
      await expect(readApartmentWorkbook(file)).rejects.toMatchObject({
        response: { code: 'INVALID_TEMPLATE' },
        status: 422,
      });
    },
  );

  it('rejects a missing worksheet and non-header data in extra columns', async () => {
    await expect(
      readApartmentWorkbook(
        await makeFile([], [...APARTMENT_IMPORT_HEADERS], 'Sheet1'),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(
      readApartmentWorkbook(await makeFile([[...exampleRow(), 'extra']])),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it.each(APARTMENT_IMPORT.FALLBACK_MIME_TYPES)(
    'validates actual XLSX bytes when browser MIME is%s',
    async (mimeType) => {
      const file = await makeFile([exampleRow()]);
      expect(await readApartmentWorkbook({ ...file, mimeType })).toHaveLength(
        1,
      );
      await expect(
        readApartmentWorkbook({
          ...file,
          mimeType,
          bytes: Buffer.from('notxlsx'),
        }),
      ).rejects.toMatchObject({ status: 422 });
    },
  );

  it('rejects wrong extension, MIME, empty, oversized and non-XLSX content', async () => {
    const valid = await makeFile();
    const inputs = [
      { ...valid, name: 'apartments.xls' },
      { ...valid, mimeType: 'text/csv' },
      { ...valid, bytes: Buffer.alloc(0) },
      { ...valid, bytes: Buffer.alloc(APARTMENT_IMPORT.MAX_FILE_BYTES + 1) },
      { ...valid, bytes: Buffer.from('not an xlsx') },
    ];
    for (const file of inputs) {
      await expect(readApartmentWorkbook(file)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    }
  });

  it('flags formulas without reading their cached results; reports them as inert text', async () => {
    const file = await makeFile([
      [
        ...exampleRow().slice(0, 9),
        { formula: '1+1', result: 2 },
        ...exampleRow().slice(10),
      ],
    ]);
    const rows = await readApartmentWorkbook(file);
    expect(rows[0].cells[9]).toBe('=1+1');
    expect(rows[0].errors).toHaveLength(1);
    const report = await createApartmentErrorReport([
      { cells: rows[0].cells, reason: rows[0].errors.join('; ') },
    ]);
    const workbook = await readWorkbook(report);
    const sheet = workbook.getWorksheet(APARTMENT_IMPORT.SHEET);
    expect(sheet?.getCell('J2').value).toBe('=1+1');
    expect(sheet?.getCell('J2').formula).toBeFalsy();
    expect(
      sheet?.getRow(1).getCell(APARTMENT_IMPORT_HEADERS.length + 1).value,
    ).toBe('סיבה');
  });

  it('preserves oversized cell originals while flagging them', async () => {
    const value = 'א'.repeat(APARTMENT_IMPORT.MAX_CELL_CHARACTERS + 1);
    const rows = await readApartmentWorkbook(await makeFile([[value]]));
    expect(rows[0].cells[0]).toBe(value);
    expect(rows[0].errors).toHaveLength(1);
  });

  it('ignores whitespace-only data rows', async () => {
    const rows = await readApartmentWorkbook(
      await makeFile([['  ', '\t', '\n']]),
    );
    expect(rows).toEqual([]);
  });

  it('rejects non-formula object cells without treating them as plain values', async () => {
    const file = await makeFile([
      [{ text: 'example', hyperlink: 'https://example.com' }],
    ]);
    const rows = await readApartmentWorkbook(file);
    expect(rows[0].cells[0]).toBe('example');
    expect(rows[0].errors).toHaveLength(1);
  });

  it('accepts the maximum row boundary and rejects the next row', async () => {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet(APARTMENT_IMPORT.SHEET);
    sheet.addRow([...APARTMENT_IMPORT_HEADERS]);
    sheet.getRow(APARTMENT_IMPORT.MAX_ROWS + 1).values = exampleRow();
    const file = {
      name: 'apartments.xlsx',
      mimeType: APARTMENT_IMPORT.MIME_TYPE,
      bytes: Buffer.from(await workbook.xlsx.writeBuffer()),
    };
    expect(await readApartmentWorkbook(file)).toEqual([
      {
        rowNumber: APARTMENT_IMPORT.MAX_ROWS + 1,
        cells: exampleRow(),
        errors: [],
      },
    ]);
    sheet.getRow(APARTMENT_IMPORT.MAX_ROWS + 2).values = exampleRow();
    await expect(
      readApartmentWorkbook({
        ...file,
        bytes: Buffer.from(await workbook.xlsx.writeBuffer()),
      }),
    ).rejects.toMatchObject({
      status: 422,
      response: { code: APARTMENT_IMPORT.TEMPLATE_ERROR },
    });
  });

  it('reads a real 100-row workbook without altering row data', async () => {
    const input = Array.from({ length: 100 }, (_, index) => [
      '2',
      String(index + 1),
      ...exampleRow().slice(2),
    ]);
    const rows = await readApartmentWorkbook(await makeFile(input));
    expect(rows.map(({ cells }) => cells)).toEqual(input);
    expect(rows.every(({ errors }) => errors.length === 0)).toBe(true);
  });
});
