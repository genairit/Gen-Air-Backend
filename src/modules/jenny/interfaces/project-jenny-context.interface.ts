import { TaskStatusType } from '@Modules/task/constants/task-status.constant';
import { ProjectDocumentSkipReasonType } from '@Modules/project-document/constants/project-document.constant';

export interface IJennyProjectTeamMember {
  role: string;
  name: string | null;
}

export interface IJennyProjectStatus {
  code: string;
  name: string;
  updatedAt: string;
  city: string | null;
  isApartment: boolean;
  notes: string | null;
  stage: string | null;
  address: string | null;
  projectType: string | null;
  buildingName: string | null;
  customerName: string | null;
  waitingReason: string | null;
  team: IJennyProjectTeamMember[];
}

export interface IJennyQuotationSummary {
  date: string;
  brand: string;
  number: string;
  status: string;
  version: number;
  discount: string;
  vatAmount: string;
  projectRole: string;
  totalWithVat: string;
  vatRatePercent: string;
  totalBeforeVat: string;
  sharedFromCode: string | null;
  subtotalBeforeDiscount: string;
}

export interface IJennyTaskSummary {
  title: string;
  isUrgent: boolean;
  status: TaskStatusType;
  dueDate: string | null;
  assignee: string | null;
}

export interface IJennyListedDocument {
  url: string;
  name: string;
  folder: string | null;
  modifiedTime: string | null;
}

export interface IJennyDocumentHit {
  page: number;
  snippet: string;
  fileName: string;
  folder: string | null;
}

export interface IJennySkippedDocument {
  fileName: string;
  reason: ProjectDocumentSkipReasonType;
}
