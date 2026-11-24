export interface IQuotationFilenameContext {
  title: string;
  number: string;
  brands: string[];
  quotationId: string;
  customerName: string;
  projectName: string | null;
  buildingName: string | null;
  apartmentNumber: string | null;
}

export interface IFilenamePrefix {
  value: string;
  complete: boolean;
}

export interface IFilenamePart {
  value: string;
  prefix: string;
}

export interface IBoundedFilenameGroup {
  budget: number;
  separator: string;
  parts: IFilenamePart[];
}
