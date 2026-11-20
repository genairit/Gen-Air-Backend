import type { ExecutionPlanStatusType } from '../constants/execution-plan.constant';

export interface IExecutionPlanChecklistItem {
  key: string;
  label: string;
  confirmed: boolean;
}

export interface IExecutionPlanTemplateItem {
  key: string;
  label: string;
}

export interface IExecutionPlanTemplate {
  id: string;
  version: number;
  createdAt: Date;
  items: IExecutionPlanTemplateItem[];
}

export interface IExecutionPlanSubmission {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  revision: number;
  projectId: string;
  quotationId: string;
  driveFileId: string;
  planVersion: string;
  driveFileName: string;
  submittedById: string;
  templateVersion: number;
  reviewedAt: Date | null;
  driveFileVersion: string;
  submittedAt: Date | null;
  reviewedById: string | null;
  supersedesId: string | null;
  returnComment: string | null;
  status: ExecutionPlanStatusType;
  checklist: IExecutionPlanChecklistItem[];
}

export type TExecutionPlanCreation = Omit<
  IExecutionPlanSubmission,
  'id' | 'createdAt' | 'updatedAt'
>;

export interface IExecutionPlanPendingRow extends IExecutionPlanSubmission {
  projectName: string;
  projectCode: string;
  submitterName: string;
  quotationNumber: string;
}
