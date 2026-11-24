import type { TQuotationStatus } from '../constants/quotation.constant';
import type { TaskType } from '@Modules/task/constants/task-type.constant';
import type { TaskQuotationUnavailableReasonType } from '../constants/task-quotation.constant';

export interface ITaskQuotationSummary {
  id: string;
  number: string;
  isPrimary: boolean;
  status: TQuotationStatus;
}
export interface IQuotationTaskLink {
  title: string;
  taskId: string;
  isPrimary: boolean;
}
export interface ITaskContext {
  id: string;
  title: string;
  taskType: TaskType;
  projectId: string | null;
  customerId: string | null;
}
export interface ITaskQuotationContextResponse {
  canCreate: boolean;
  projectId: string | null;
  customerId: string | null;
  primaryQuotationId: string | null;
  quotations: ITaskQuotationSummary[];
  unavailableReason: TaskQuotationUnavailableReasonType | null;
}
export interface ITaskQuotationResult {
  created: boolean;
  quotationId: string;
}
export interface IQuotationTaskMetadata {
  taskContextLocked: boolean;
  taskProjectLocked: boolean;
  taskLinks: IQuotationTaskLink[];
}
