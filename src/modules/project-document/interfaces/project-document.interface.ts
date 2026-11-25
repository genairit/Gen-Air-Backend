import {
  ProjectDocumentStatusType,
  ProjectDocumentSkipReasonType,
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
  'fileId' | 'status' | 'md5Checksum' | 'driveModifiedTime'
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

export interface IProjectDocumentSearchRequest {
  query: string;
  projectId: string;
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

export interface IExtractedPdf {
  pages: string[];
  totalPages: number;
}
