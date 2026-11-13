export interface IProjectBoqLine {
  id: string;
  notes: string;
  sourceKey: string;
  materialId: string;
  systemTitle: string;
  sourceBasis: string;
  reviewState: string;
  materialCode: string;
  materialName: string;
  materialUnit: string;
  displayOrder: number;
  orderedQuantity: null;
  componentTitle: string;
  sourceSnapshot: object;
  requestedQuantity: null;
  remainingQuantity: null;
  materialCategory: string;
  quantityOverridden: boolean;
  proposedQuantity: string | null;
  requiredQuantity: string | null;
  estimatedUnitCost: string | null;
  estimatedLineCost: string | null;
  materialSpecification: string | null;
}

export interface IProjectBoqView {
  revision: number;
  projectId: string;
  updatedAt: Date | null;
  estimatedTotal: string;
  ledgerAvailable: false;
  unresolvedCount: number;
  lines: IProjectBoqLine[];
  missingCostCount: number;
  sourceQuotationId: string | null;
  sourceQuotationNumber: string | null;
  sourceQuotationVersion: number | null;
}

export interface IProjectBoqPreview {
  added: string[];
  changed: string[];
  removed: string[];
  quotationId: string;
  fingerprint: string;
  includedCount: number;
  quotationNumber: string;
  quotationVersion: number;
  lines: IProjectBoqLine[];
  unmappedCatalogueItems: string[];
}
