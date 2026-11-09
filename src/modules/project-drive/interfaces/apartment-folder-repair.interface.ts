export interface IApartmentFolderRepair {
  buildingId: string;
  apartmentId: string;
  sourceFolderId: string;
  destinationFolderId: string;
  status: 'already_placed' | 'needs_move';
}
