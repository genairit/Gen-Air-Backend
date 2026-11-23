import type {
  PublicationKindType,
  PublicationRoleType,
  PublicationStateType,
} from '../constants/publication.constant';

import type { Transaction } from 'sequelize';
import type { PermissionType } from '@Constants/authorization.constant';
import type { PublicationResultStatusType } from '../constants/publication.constant';
import type { IQuotationDocument } from '@Modules/quotation/interfaces/quotation-document.interface';

export type TPublicationRecord = Record<string, unknown>;

export interface IPublicationSnapshot {
  filename: string;
  filenamePolicy: string;
  rendererVersion: string;
  source: IQuotationDocument;
  document: TPublicationRecord;
  namingInputs: TPublicationRecord;
}
export interface IPublicationLifecycle {
  eventId: string;
  actorId: string;
  transaction: Transaction;
  permission: PermissionType;
  document: IQuotationDocument;
}
export interface IPublicationHistory {
  cycleId: string;
  updatedAt: string;
  generation: number;
  sourceVersion: number;
  reason: string | null;
  fileUrl: string | null;
  state: PublicationStateType;
  lifecycleEventId: string | null;
  destinationLabel: string | null;
  documentKind: PublicationKindType | null;
}
export interface IPublicationSummary {
  canRetry: boolean;
  reason: string | null;
  cycleId: string | null;
  fileUrl: string | null;
  updatedAt: string | null;
  generation: number | null;
  state: PublicationStateType;
  sourceVersion: number | null;
  history: IPublicationHistory[];
  destinationLabel: string | null;
  documentKind: PublicationKindType | null;
}
export interface IPublicationCycle {
  id: string;
  projectId: string;
  terminal: boolean;
  updatedAt: string;
  generation: number;
  quotationId: string;
  rootId: string | null;
  fileId: string | null;
  sourceVersion: number;
  reason: string | null;
  actualHash: string | null;
  state: PublicationStateType;
  actualFolderId: string | null;
  destinationLabel: string | null;
  desiredKind: PublicationKindType;
  rootContext: IPublicationRootContext;
}
export interface IPublicationOperation {
  id: string;
  jobId: string;
  cycleId: string;
  attempt: number;
  updatedAt: string;
  generation: number;
  sourceHash: string;
  pdf: Buffer | null;
  hash: string | null;
  sourceVersion: number;
  reason: string | null;
  md5Hash: string | null;
  effectStarted: boolean;
  revisionId: string | null;
  dispatchedAt: Date | null;
  state: PublicationStateType;
  destinationLabel: string | null;
  lifecycleEventId: string | null;
  kind: PublicationKindType | null;
  destinationFolderId: string | null;
  snapshot: IPublicationSnapshot | null;
}
export interface IPublicationFolder {
  label: string;
  rootId: string;
  folderId: string;
  projectId: string;
  confirmed: boolean;
  role: PublicationRoleType;
}
export interface IPublicationCorrelation {
  cycleId: string;
  generation: number;
  sourceHash: string;
  operationId: string;
}
export interface IPublicationResult {
  jobId: string;
  status: PublicationResultStatusType;
  correlation: IPublicationCorrelation;
  output: { pdfBase64: string; sha256: string; byteLength: number } | null;
}

export interface IPublicationRootContext {
  linked: boolean;
  projectLabel: string;
  parentRootId: string | null;
  parentProjectId: string | null;
}
export interface IPublicationRootConfiguration extends IPublicationRootContext {
  rootId: string | null;
}
export interface IPublicationEffectPlan {
  cycleId: string;
  terminal: boolean;
  generation: number;
  operationId: string;
  folder: IPublicationFolder;
}
export interface IPublicationFolderIdentity {
  id: string;
}
export interface IPublicationTemplate {
  name: string;
}
