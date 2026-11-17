import type { IProjectBoqLine } from '@Modules/project-boq/interfaces/project-boq.interface';

export interface IPurchaseLine extends Omit<
  IProjectBoqLine,
  'requestedQuantity' | 'orderedQuantity' | 'remainingQuantity'
> {
  ordered: boolean;
  overrunQuantity: string;
  orderedQuantity: string;
  requestedQuantity: string;
  remainingQuantity: string | null;
}

export interface IPurchaseHistoryLine {
  id: string;
  quantity: string;
  materialId: string;
  materialName: string;
  materialUnit: string;
  boqSourceKey: string;
  currencyCode: string;
  activeQuantity: string;
  unitCost: string | null;
  supplierAgreementId: string | null;
  supplierAgreementVersion: number | null;
}

export interface IPurchaseHistoryEvent {
  id: string;
  action: string;
  reason: string;
  actorId: string;
  createdAt: Date;
  nextStatus: string;
  previousStatus: string | null;
}

export interface IPurchaseHistory {
  id: string;
  notes: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  createdById: string;
  updatedById: string;
  orderDate: string | null;
  onBehalfOf: string | null;
  supplierId: string | null;
  supplierName: string | null;
  supplierPhone: string | null;
  supplierEmail: string | null;
  lines: IPurchaseHistoryLine[];
  exceptionReason: string | null;
  events: IPurchaseHistoryEvent[];
  supplierContactName: string | null;
}

export interface IPurchaseWorkspace {
  revision: number;
  projectId: string;
  lines: IPurchaseLine[];
  nextCursor: string | null;
  history: IPurchaseHistory[];
}
