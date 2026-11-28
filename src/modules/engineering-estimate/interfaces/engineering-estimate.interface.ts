import {
  ESTIMATE_SCOPE,
  ESTIMATE_STATUS,
  ESTIMATE_SETUP_STEP,
  ESTIMATE_LINE_SOURCE,
} from '../constants/engineering-estimate.constant';

import type { EstimateLineDto } from '../dto/engineering-estimate.dto';

export type TEstimateScope =
  (typeof ESTIMATE_SCOPE)[keyof typeof ESTIMATE_SCOPE];
export type TEstimateStatus =
  (typeof ESTIMATE_STATUS)[keyof typeof ESTIMATE_STATUS];
export type TEstimateSetupStep =
  (typeof ESTIMATE_SETUP_STEP)[keyof typeof ESTIMATE_SETUP_STEP];

export interface IEstimateInputLine {
  id: string;
  source?: string;
  quantity: string;
  catalogueItemId: string;
  measurements?: EstimateLineDto['measurements'];
}

export interface IEstimateArea {
  id: string;
  name: string;
  repeatCount: number;
  lines: IEstimateInputLine[];
}

export interface IEstimateQuestion {
  id: string;
  prompt: string;
  options: string[];
  answer: string | null;
}

export interface IEstimatePlan {
  id: string;
  name: string;
  marked: boolean;
  mimeType: string;
}

export interface IEstimateLine {
  sku: string;
  unit: string;
  areaId: string;
  areaName: string;
  quantity: string;
  description: string;
  total: string | null;
  unitPrice: string | null;
  provenance: string | null;
  catalogueItemId: string | null;
  source: (typeof ESTIMATE_LINE_SOURCE)[keyof typeof ESTIMATE_LINE_SOURCE];
}

export interface IEstimateContents {
  scope: TEstimateScope;
  areas: IEstimateArea[];
  setupStep: TEstimateSetupStep;
  questions: IEstimateQuestion[];
}

export interface IEstimateRecord extends IEstimateContents {
  id: string;
  name: string;
  version: number;
  updatedAt: Date;
  createdById: string;
  projectId: string | null;
}

export interface IEstimateRevision {
  version: number;
  status: TEstimateStatus;
  quotationId: string | null;
  quotationUnavailable: boolean;
  snapshot: IEstimateReviewSnapshot;
}

export interface IEstimateReviewSnapshot {
  name: string;
  subtotal: string;
  areaIds: string[];
  planIds: string[];
  rulesVersion: string;
  lines: IEstimateLine[];
  projectId: string | null;
  customerId: string | null;
  projectName: string | null;
  customerName: string | null;
  contents: IEstimateContents;
  samples: { areaId: string; planId: string }[];
}

export interface IEstimateSummary {
  id: string;
  name: string;
  updatedAt: Date;
  status: TEstimateStatus;
  projectId: string | null;
}

export interface IEstimatePlanSource {
  fileId: string;
  projectId: string;
}

export interface IStoredEstimatePlan extends IEstimatePlan {
  content: Buffer;
  source: IEstimatePlanSource | null;
}

export interface IEstimateView extends Omit<IEstimateRecord, 'createdById'> {
  subtotal: string;
  lines: IEstimateLine[];
  plans: IEstimatePlan[];
  status: TEstimateStatus;
  quotationId: string | null;
  quotationUnavailable: boolean;
  approvedVersion: number | null;
  quotationCustomerId: string | null;
}

export interface IEstimatePreview {
  subtotal: string;
  lines: IEstimateLine[];
}

export interface IEstimateExport {
  fileName: string;
  fileUrl: string | null;
}
