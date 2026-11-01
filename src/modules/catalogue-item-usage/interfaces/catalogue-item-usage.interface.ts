export interface ICatalogueItemUsage {
  id: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  lastSelectedAt: Date;
  selectionCount: number;
  deletedAt: Date | null;
  catalogueItemId: string;
}
