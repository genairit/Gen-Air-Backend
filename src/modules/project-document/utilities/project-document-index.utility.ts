import {
  PROJECT_DOCUMENT_LIMITS,
  PROJECT_DOCUMENT_STATUSES,
  ProjectDocumentStatusType,
  ProjectDocumentSkipReasonType,
} from '../constants/project-document.constant';

import {
  IExtractedPdf,
  IProjectDocumentHit,
  IProjectDocumentPage,
  IProjectDocumentSkip,
  TProjectDocumentState,
  IIndexedProjectDocument,
  IProjectDocumentPageMatch,
  IProjectDocumentIndexPlan,
} from '../interfaces/project-document.interface';

import { GOOGLE_DRIVE } from '@Constants/google-drive.constant';
import { toDriveFileLink } from '@Utilities/google-drive.utility';
import { IDriveTreeFile } from '@Interfaces/google-drive.interface';
import { fixVisualOrderHebrew } from '@Utilities/hebrew-text.utility';

const HORIZONTAL_WHITESPACE = /[^\S\n]+/g;
const ANY_WHITESPACE = /\s/g;

const toTimestamp = (date: Date | null): number | null =>
  date?.getTime() ?? null;

export const isPdfFile = (file: IDriveTreeFile): boolean =>
  file.mimeType === GOOGLE_DRIVE.PDF_MIME_TYPE;

export const isOversizedFile = (file: IDriveTreeFile): boolean =>
  (file.size ?? 0) > PROJECT_DOCUMENT_LIMITS.MAX_FILE_BYTES;

export const hasDocumentChanged = (
  stored: TProjectDocumentState | null,
  file: IDriveTreeFile,
): boolean => {
  if (!stored) {
    return true;
  }

  const checksumChanged = file.md5Checksum !== stored.md5Checksum;
  const modifiedTimeChanged =
    toTimestamp(file.modifiedTime) !== toTimestamp(stored.driveModifiedTime);

  return checksumChanged || modifiedTimeChanged;
};

export const planDocumentIndex = (
  files: IDriveTreeFile[],
  storedDocuments: TProjectDocumentState[],
): IProjectDocumentIndexPlan => {
  const storedById = new Map(
    storedDocuments.map((document) => [document.fileId, document]),
  );
  const currentFileIds = new Set(files.map((file) => file.id));
  const isStale = (file: IDriveTreeFile): boolean =>
    hasDocumentChanged(storedById.get(file.id) ?? null, file);

  return {
    stale: files.filter(isStale),
    unchanged: files.filter((file) => !isStale(file)),
    removedFileIds: storedDocuments
      .filter((document) => !currentFileIds.has(document.fileId))
      .map((document) => document.fileId),
  };
};

export const normalizePageText = (text: string): string =>
  fixVisualOrderHebrew(text)
    .replace(HORIZONTAL_WHITESPACE, ' ')
    .trim()
    .slice(0, PROJECT_DOCUMENT_LIMITS.MAX_PAGE_CHARACTERS);

const toDocumentPages = (
  projectId: string,
  fileId: string,
  pages: string[],
): IProjectDocumentPage[] =>
  pages
    .map((text, index) => ({
      fileId,
      projectId,
      pageNumber: index + 1,
      text: normalizePageText(text),
    }))
    .filter((page) => page.text.length > 0);

const countTextCharacters = (pages: IProjectDocumentPage[]): number =>
  pages.reduce(
    (total, page) => total + page.text.replace(ANY_WHITESPACE, '').length,
    0,
  );

const resolveExtractedStatus = (
  extracted: IExtractedPdf | null,
  pages: IProjectDocumentPage[],
): ProjectDocumentStatusType => {
  if (!extracted) {
    return PROJECT_DOCUMENT_STATUSES.UNREADABLE;
  }

  if (extracted.totalPages > PROJECT_DOCUMENT_LIMITS.MAX_PAGES) {
    return PROJECT_DOCUMENT_STATUSES.TOO_MANY_PAGES;
  }

  if (
    countTextCharacters(pages) < PROJECT_DOCUMENT_LIMITS.MIN_TEXT_CHARACTERS
  ) {
    return PROJECT_DOCUMENT_STATUSES.SCANNED;
  }

  return PROJECT_DOCUMENT_STATUSES.INDEXED;
};

export const buildUnindexedDocument = (
  projectId: string,
  file: IDriveTreeFile,
  status: ProjectDocumentStatusType,
): IIndexedProjectDocument => ({
  pages: [],
  document: {
    status,
    projectId,
    pageCount: 0,
    fileId: file.id,
    md5Checksum: file.md5Checksum,
    driveModifiedTime: file.modifiedTime,
  },
});

export const buildIndexedDocument = (
  projectId: string,
  file: IDriveTreeFile,
  extracted: IExtractedPdf | null,
): IIndexedProjectDocument => {
  const pages = toDocumentPages(projectId, file.id, extracted?.pages ?? []);
  const status = resolveExtractedStatus(extracted, pages);

  if (status !== PROJECT_DOCUMENT_STATUSES.INDEXED) {
    return buildUnindexedDocument(projectId, file, status);
  }

  return {
    pages,
    document: {
      ...buildUnindexedDocument(projectId, file, status).document,
      pageCount: extracted?.totalPages ?? pages.length,
    },
  };
};

export const toDocumentSkip = (
  file: IDriveTreeFile,
  reason: ProjectDocumentSkipReasonType,
): IProjectDocumentSkip | null => {
  if (reason === PROJECT_DOCUMENT_STATUSES.INDEXED) {
    return null;
  }

  return { reason, fileId: file.id, fileName: file.name };
};

export const toStoredSkips = (
  unchanged: IDriveTreeFile[],
  storedDocuments: TProjectDocumentState[],
): IProjectDocumentSkip[] => {
  const statusByFileId = new Map(
    storedDocuments.map((document) => [document.fileId, document.status]),
  );

  return unchanged.flatMap(
    (file) =>
      toDocumentSkip(
        file,
        statusByFileId.get(file.id) ?? PROJECT_DOCUMENT_STATUSES.INDEXED,
      ) ?? [],
  );
};

export const toDocumentHits = (
  matches: IProjectDocumentPageMatch[],
  files: IDriveTreeFile[],
): IProjectDocumentHit[] => {
  const filesById = new Map(files.map((file) => [file.id, file]));

  return matches.flatMap((match) => {
    const file = filesById.get(match.fileId);

    if (!file) {
      return [];
    }

    return [
      {
        fileId: file.id,
        fileName: file.name,
        page: match.pageNumber,
        snippet: match.snippet,
        folderPath: file.folderPath,
        url: toDriveFileLink(file),
      },
    ];
  });
};
