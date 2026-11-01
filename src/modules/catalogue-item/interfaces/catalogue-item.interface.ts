export interface ICatalogueItem {
  id: string;
  sku: string;
  unit: string;
  price: string;
  brand: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  preference: string;
  description: string;
  equipmentRole: string;
  deletedAt: Date | null;
  includesRemote: boolean;
  equipmentTypes: string[];
  systemType: string | null;
  capacityBtu: number | null;
  includesThermostat: boolean;
}
