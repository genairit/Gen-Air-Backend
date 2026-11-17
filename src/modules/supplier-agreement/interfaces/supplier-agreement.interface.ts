export interface ISupplierView {
  id: string;
  name: string;
  notes: string;
  active: boolean;
  version: number;
  phone: string | null;
  email: string | null;
  contactName: string | null;
}

export interface IAgreementView {
  id: string;
  notes: string;
  active: boolean;
  version: number;
  projectId: string;
  unitPrice: string;
  materialId: string;
  supplierId: string;
  boqSourceKey: string;
  materialUnit: string;
  supplierName: string;
  currencyCode: string;
  effectiveFrom: string | null;
  agreedQuantity: string | null;
  effectiveThrough: string | null;
}

export interface IAgreementRevisionView {
  version: number;
  actorId: string;
  createdAt: Date;
  snapshot: object;
}

export interface IAgreementSelectionLine {
  materialId: string;
  agreementId: string;
  boqSourceKey: string;
  materialUnit: string;
  unitCost?: string | null;
  agreementVersion?: number | null;
}

export interface ISelectedAgreement {
  id: string;
  version: number;
  unitPrice: string;
  currencyCode: string;
}

export type TAgreementSelection = {
  selectedSupplier: ISupplierView;
  agreements: ReadonlyMap<string, ISelectedAgreement>;
};
