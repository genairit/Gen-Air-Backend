import {
  APARTMENT_IMPORT_ROW_STATUS,
  ApartmentImportRowStatusType,
} from '../constants/apartment-import-result.constant';

export interface IApartmentImportRowResult {
  reason: string;
  apartment: string;
  rowNumber: number;
  cells: readonly string[];
  status: ApartmentImportRowStatusType;
}

export type ApartmentImportSkippedStatusType = Exclude<
  ApartmentImportRowStatusType,
  typeof APARTMENT_IMPORT_ROW_STATUS.CREATED
>;

export interface IApartmentImportSkippedRow {
  reason: string;
  apartment: string;
  rowNumber: number;
  status: ApartmentImportSkippedStatusType;
}

export type ApartmentImportCountsType = Record<
  ApartmentImportRowStatusType,
  number
>;

export interface IApartmentImportResult {
  reportBase64: string | null;
  counts: ApartmentImportCountsType;
  rows: IApartmentImportSkippedRow[];
}
