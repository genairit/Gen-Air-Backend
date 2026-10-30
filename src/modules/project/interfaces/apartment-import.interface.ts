export interface IApartmentImportFile {
  name: string;
  bytes: Buffer;
  mimeType: string;
}

export interface IApartmentWorkbookRow {
  rowNumber: number;
  cells: readonly string[];
  errors: readonly string[];
}

export interface IApartmentErrorReportRow {
  reason: string;
  cells: readonly string[];
}
