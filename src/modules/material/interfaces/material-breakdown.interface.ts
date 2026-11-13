import type {
  MaterialUnitType,
  MaterialBasisType,
  MaterialStatusType,
} from '../constants/material.constant';

export interface IMaterialDetails {
  id: string;
  code: string;
  name: string;
  category: string;
  unit: MaterialUnitType;
  status: MaterialStatusType;
  specification: string | null;
}

export interface IMaterialSnapshotLine extends Omit<IMaterialDetails, 'id'> {
  notes: string;
  materialId: string;
  displayOrder: number;
  basis: MaterialBasisType;
  quantityPerItem: string | null;
}

export interface IMaterialBreakdown {
  revision: number;
  catalogueItemId: string;
  lines: IMaterialSnapshotLine[];
}

export interface IMaterialPreviewContribution {
  notes: string;
  catalogueItemId: string;
  quantity: string | null;
  basis: MaterialBasisType;
  material: IMaterialDetails;
}

export interface IMaterialPreviewResponse {
  included: IMaterialPreviewContribution[];
  unresolved: IMaterialPreviewContribution[];
  required: {
    material: IMaterialDetails;
    quantity: string;
    contributions: { catalogueItemId: string; quantity: string }[];
  }[];
}
