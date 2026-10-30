import {
  APARTMENT_IMPORT,
  APARTMENT_IMPORT_HEADERS,
} from '../constants/apartment-import.constant';

import {
  IApartmentImportFile,
  IApartmentWorkbookRow,
  IApartmentErrorReportRow,
} from '../interfaces/apartment-import.interface';

import { Readable } from 'node:stream';
import { Cell, Workbook, Worksheet } from 'exceljs';
import { TypedLogger } from '@Logger/logger.service';
import { UnprocessableEntityException } from '@nestjs/common';
import { HTTP_ERROR_CODES } from '@Constants/http-error-code.constant';
import { getHttpErrorPayload } from '@Utilities/http-error-payload.utility';
import { validateArchiveFile } from '@Utilities/drive-upload-archive.utility';
import { validateApartmentImportContacts } from './apartment-import-contact.utility';

const logger = new TypedLogger('ApartmentImportWorkbook');

export const readApartmentWorkbook = async (
  file: IApartmentImportFile,
): Promise<IApartmentWorkbookRow[]> => {
  assertImportFile(file);
  const workbook = await loadImportWorkbook(file);
  const sheet = workbook.getWorksheet(APARTMENT_IMPORT.SHEET) ?? null;
  assertImportSheet(sheet);
  return readImportRows(sheet);
};

export const createApartmentTemplate = async (): Promise<Buffer> => {
  const workbook = createWorkbook(APARTMENT_IMPORT_HEADERS);
  return Buffer.from(await workbook.xlsx.writeBuffer());
};

export const createApartmentErrorReport = async (
  rows: readonly IApartmentErrorReportRow[],
): Promise<Buffer> => {
  const workbook = createWorkbook([
    ...APARTMENT_IMPORT_HEADERS,
    APARTMENT_IMPORT.ERROR_HEADER,
  ]);
  const sheet = workbook.getWorksheet(APARTMENT_IMPORT.SHEET);
  if (!sheet) {
    throw new Error('Apartment report worksheet was not created');
  }

  rows.forEach(({ cells, reason }) => {
    const values = APARTMENT_IMPORT_HEADERS.map(
      (_, index) => cells[index] ?? '',
    );
    sheet.addRow([...values, reason]);
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
};

const invalidTemplate = (message: string): never => {
  throw new UnprocessableEntityException({
    ...getHttpErrorPayload(HTTP_ERROR_CODES.INVALID_TEMPLATE),
    message,
  });
};

const assertImportFile = ({
  name,
  bytes,
  mimeType,
}: IApartmentImportFile): void => {
  if (
    !name.toLowerCase().endsWith('.xlsx') ||
    (mimeType !== APARTMENT_IMPORT.MIME_TYPE &&
      !APARTMENT_IMPORT.FALLBACK_MIME_TYPES.some(
        (accepted) => accepted === mimeType,
      ))
  ) {
    invalidTemplate('Only XLSX files are supported');
  }

  if (bytes.length === 0 || bytes.length > APARTMENT_IMPORT.MAX_FILE_BYTES) {
    invalidTemplate('File is empty or exceeds the 5 MB limit');
  }
};

const loadImportWorkbook = async (
  file: IApartmentImportFile,
): Promise<Workbook> => {
  try {
    await validateArchiveFile(file.name, file.bytes);
    const workbook = new Workbook();
    await workbook.xlsx.read(Readable.from([file.bytes]));
    return workbook;
  } catch {
    logger.warn({ message: 'Rejected invalid apartment import workbook' });
    return invalidTemplate('File is not a valid and safe XLSX workbook');
  }
};

const assertImportSheet: (
  sheet: Worksheet | null,
) => asserts sheet is Worksheet = (sheet) => {
  if (!sheet) {
    return invalidTemplate('Required apartment worksheet is missing');
  }

  if (sheet.rowCount > APARTMENT_IMPORT.MAX_ROWS + 1) {
    invalidTemplate(
      `Import supports at most ${APARTMENT_IMPORT.MAX_ROWS} rows per file`,
    );
  }

  if (sheet.columnCount !== APARTMENT_IMPORT_HEADERS.length) {
    invalidTemplate(
      `Exactly ${APARTMENT_IMPORT_HEADERS.length} columns are required`,
    );
  }

  const headersMatch = APARTMENT_IMPORT_HEADERS.every((header, index) => {
    const cell = sheet.getRow(1).getCell(index + 1);
    return typeof cell.value === 'string' && cell.value === header;
  });
  if (!headersMatch) {
    invalidTemplate(`Column headers must match the official template in order`);
  }
};

const readImportRows = (sheet: Worksheet): IApartmentWorkbookRow[] => {
  const rows: IApartmentWorkbookRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }

    const results = APARTMENT_IMPORT_HEADERS.map((_, index) =>
      readImportCell(row.getCell(index + 1)),
    );
    const cells = results.map(({ text }) => text);
    const errors = results.flatMap(({ error }, index) =>
      error ? [`${APARTMENT_IMPORT_HEADERS[index]}: ${error}`] : [],
    );
    const isBlank =
      cells.every((cell) => cell.trim() === '') && errors.length === 0;
    if (isBlank) {
      return;
    }

    rows.push({
      cells,
      rowNumber,
      errors: [...errors, ...validateApartmentImportContacts(cells)],
    });
  });
  return rows;
};

const readImportCell = (cell: Cell): { text: string; error: string | null } => {
  const value = cell.value;
  if (value == null) {
    return { text: '', error: null };
  }

  if (typeof value === 'object') {
    return {
      text: cell.formula ? `=${cell.formula}` : cell.text,
      error: 'יש להזין ערך פשוט, ללא נוסחאות או אובייקטים',
    };
  }

  const text = String(value);
  if (text.length > APARTMENT_IMPORT.MAX_CELL_CHARACTERS) {
    return {
      text,
      error: 'הערך ארוך מהמותר',
    };
  }

  return { text, error: null };
};

const createWorkbook = (headers: readonly string[]): Workbook => {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet(APARTMENT_IMPORT.SHEET, {
    views: [{ rightToLeft: true }],
  });
  sheet.addRow([...headers]);
  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach((column) => {
    column.width = 24;
    column.numFmt = '@';
  });
  return workbook;
};
