export interface IQuotationItem {
  id: string;
  sku: string;
  unit: string;
  createdAt: Date;
  updatedAt: Date;
  quantity: string;
  location: string;
  sectionId: string;
  description: string;
  quotedPrice: string;
  displayOrder: number;
  equipmentRole: string;
  circuit: string | null;
  deletedAt: Date | null;
  catalogueStatus: string;
  catalogueItemId: string;
  includesRemote: boolean;
  controlKind: string | null;
  capacityBtu: number | null;
  cataloguePreference: string;
  parentItemId: string | null;
  includesThermostat: boolean;
  equipmentType: string | null;
  requestedCapacityBtu: number | null;
}
