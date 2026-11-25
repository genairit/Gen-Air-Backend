import {
  ProjectDocumentStatusType,
  ProjectDocumentSkipReasonType,
  PROJECT_DOCUMENT_STATE_ATTRIBUTES,
} from '../constants/project-document.constant';

import { IDriveTreeFile } from '@Interfaces/google-drive.interface';

export interface IProjectDocument {
  fileId: string;
  indexedAt: Date;
  projectId: string;
  pageCount: number;
  md5Checksum: string | null;
  driveModifiedTime: Date | null;
  status: ProjectDocumentStatusType;
}

export type TProjectDocumentState = Pick<
  IProjectDocument,
  (typeof PROJECT_DOCUMENT_STATE_ATTRIBUTES)[number]
>;

export type TProjectDocumentWrite = Omit<IProjectDocument, 'indexedAt'>;

export interface IProjectDocumentPage {
  text: string;
  fileId: string;
  projectId: string;
  pageNumber: number;
}

export interface IIndexedProjectDocument {
  pages: IProjectDocumentPage[];
  document: TProjectDocumentWrite;
}

export interface IProjectDocumentIndexPlan {
  stale: IDriveTreeFile[];
  removedFileIds: string[];
  unchanged: IDriveTreeFile[];
}

export interface IProjectDocumentPageMatch {
  fileId: string;
  snippet: string;
  pageNumber: number;
}

export interface IProjectDocumentPageSearch {
  query: string;
  limit: number;
  projectId: string;
}

export interface IProjectDocumentSessionRequest {
  projectId: string;
  signal: AbortSignal;
}

export interface IProjectDocumentRefreshRequest extends IProjectDocumentSessionRequest {
  files: IDriveTreeFile[];
}

export interface IProjectDocumentIndexBatch extends IProjectDocumentRefreshRequest {
  deadline: number;
}

export interface IProjectDocumentFileOutcome {
  completed: boolean;
  skip: IProjectDocumentSkip | null;
}

export interface IProjectDocumentSkip {
  fileId: string;
  fileName: string;
  reason: ProjectDocumentSkipReasonType;
}

export interface IProjectDocumentHit {
  url: string;
  page: number;
  fileId: string;
  snippet: string;
  fileName: string;
  folderPath: string;
}

export interface IProjectDocumentSearch {
  pendingFiles: number;
  hits: IProjectDocumentHit[];
  skipped: IProjectDocumentSkip[];
}

export interface IProjectDocumentRefresh {
  pendingFiles: number;
  skipped: IProjectDocumentSkip[];
}

export interface IProjectDocumentIndex extends IProjectDocumentRefresh {
  pdfFiles: IDriveTreeFile[];
}

export interface IProjectDocumentSession {
  listFiles: () => Promise<IDriveTreeFile[]>;
  search: (query: string) => Promise<IProjectDocumentSearch>;
}

export interface IExtractedPdf {
  pages: string[];
  totalPages: number;
}

export interface IProjectDocumentIndexedSearch {
  query: string;
  index: IProjectDocumentIndex;
  request: IProjectDocumentSessionRequest;
}

export interface IOpenedPdf {
  pageCount: number;
  extractPages: () => Promise<string[]>;
}

export interface IPdfLoadingHandle {
  opened: Promise<IOpenedPdf>;
  destroy: () => Promise<void>;
}

export interface IPdfExtractionLimits {
  maxPages: number;
  signal: AbortSignal;
}
