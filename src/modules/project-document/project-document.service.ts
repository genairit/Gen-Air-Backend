import {
  withAbort,
  remainingUntil,
  signalWithTimeout,
} from '@Utilities/abort.utility';

import {
  PROJECT_DOCUMENT_LIMITS,
  PROJECT_DOCUMENT_STATUSES,
  PROJECT_DOCUMENT_LOCK_PREFIX,
  PROJECT_DOCUMENT_SKIP_REASONS,
} from './constants/project-document.constant';

import {
  IExtractedPdf,
  IProjectDocumentIndex,
  IProjectDocumentSearch,
  IProjectDocumentSession,
  IIndexedProjectDocument,
  IProjectDocumentRefresh,
  IProjectDocumentIndexBatch,
  IProjectDocumentFileOutcome,
  IProjectDocumentIndexedSearch,
  IProjectDocumentRefreshRequest,
  IProjectDocumentSessionRequest,
} from './interfaces/project-document.interface';

import {
  isPdfFile,
  toStoredSkips,
  toDocumentHits,
  toDocumentSkip,
  isOversizedFile,
  planDocumentIndex,
  buildIndexedDocument,
  buildUnindexedDocument,
} from './utilities/project-document-index.utility';

import { Injectable } from '@nestjs/common';
import { memoizeAsync } from '@Utilities/memoize.utility';
import { Meta, TypedLogger } from '@Logger/logger.service';
import { extractPdfPages } from './utilities/pdf-text.utility';
import { IDriveTreeFile } from '@Interfaces/google-drive.interface';
import { ProjectDocumentRepository } from './project-document.repository';
import { ProjectDriveService } from '@Modules/project-drive/project-drive.service';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';

const INTERRUPTED_OUTCOME: IProjectDocumentFileOutcome = {
  skip: null,
  completed: false,
};

@Injectable()
export class ProjectDocumentService {
  private readonly logger = new TypedLogger<Meta>(ProjectDocumentService.name);

  constructor(
    private readonly repository: ProjectDocumentRepository,
    private readonly projectDriveService: ProjectDriveService,
    private readonly transactions: DatabaseTransactionService,
  ) {}

  openSession(
    request: IProjectDocumentSessionRequest,
  ): IProjectDocumentSession {
    const listFiles = memoizeAsync(() =>
      withAbort(
        this.projectDriveService.listProjectFiles(request.projectId),
        request.signal,
      ),
    );
    const indexPdfFiles = memoizeAsync(async () =>
      this.indexPdfFiles({ ...request, files: await listFiles() }),
    );

    return {
      listFiles,
      search: async (query) =>
        this.search({ query, request, index: await indexPdfFiles() }),
    };
  }

  private async search(
    search: IProjectDocumentIndexedSearch,
  ): Promise<IProjectDocumentSearch> {
    const matches = await this.repository.searchPages({
      query: search.query,
      projectId: search.request.projectId,
      limit: PROJECT_DOCUMENT_LIMITS.MAX_SEARCH_HITS,
    });

    return {
      skipped: search.index.skipped,
      pendingFiles: search.index.pendingFiles,
      hits: toDocumentHits(matches, search.index.pdfFiles),
    };
  }

  private async indexPdfFiles(
    request: IProjectDocumentRefreshRequest,
  ): Promise<IProjectDocumentIndex> {
    const pdfFiles = request.files.filter(isPdfFile);
    const refresh = await this.refreshIndex({ ...request, files: pdfFiles });

    return { ...refresh, pdfFiles };
  }

  private async refreshIndex(
    request: IProjectDocumentRefreshRequest,
  ): Promise<IProjectDocumentRefresh> {
    const storedDocuments = await this.repository.findStates(request.projectId);
    const plan = planDocumentIndex(request.files, storedDocuments);

    await this.repository.deleteDocuments(
      request.projectId,
      plan.removedFileIds,
    );

    const outcomes = await this.indexWithinBudget({
      ...request,
      files: plan.stale.slice(0, PROJECT_DOCUMENT_LIMITS.MAX_FILES_PER_REFRESH),
      deadline: Date.now() + PROJECT_DOCUMENT_LIMITS.REFRESH_BUDGET_MS,
    });
    const completedCount = outcomes.filter(({ completed }) => completed).length;
    const newSkips = outcomes.flatMap(({ skip }) => skip ?? []);

    return {
      pendingFiles: plan.stale.length - completedCount,
      skipped: [...toStoredSkips(plan.unchanged, storedDocuments), ...newSkips],
    };
  }

  private async indexWithinBudget(
    batch: IProjectDocumentIndexBatch,
  ): Promise<IProjectDocumentFileOutcome[]> {
    const [file, ...remainingFiles] = batch.files;
    const isOutOfTime = remainingUntil(batch.deadline) === 0;

    if (!file || isOutOfTime || batch.signal.aborted) {
      return [];
    }

    const outcome = await this.indexFile(batch, file);
    const remainingOutcomes = await this.indexWithinBudget({
      ...batch,
      files: remainingFiles,
    });

    return [outcome, ...remainingOutcomes];
  }

  private async indexFile(
    batch: IProjectDocumentIndexBatch,
    file: IDriveTreeFile,
  ): Promise<IProjectDocumentFileOutcome> {
    if (isOversizedFile(file)) {
      return this.store(
        file,
        buildUnindexedDocument(
          batch.projectId,
          file,
          PROJECT_DOCUMENT_STATUSES.TOO_LARGE,
        ),
      );
    }

    const fileSignal = signalWithTimeout(
      batch.signal,
      remainingUntil(batch.deadline),
    );
    const content = await this.download(batch.projectId, file, fileSignal);

    if (!content) {
      return this.toFailedDownloadOutcome(file, fileSignal);
    }

    const extracted = await this.extract(file, content, fileSignal);

    if (fileSignal.aborted) {
      return INTERRUPTED_OUTCOME;
    }

    return this.store(
      file,
      buildIndexedDocument(batch.projectId, file, extracted),
    );
  }

  private toFailedDownloadOutcome(
    file: IDriveTreeFile,
    fileSignal: AbortSignal,
  ): IProjectDocumentFileOutcome {
    if (fileSignal.aborted) {
      return INTERRUPTED_OUTCOME;
    }

    return {
      completed: true,
      skip: toDocumentSkip(file, PROJECT_DOCUMENT_SKIP_REASONS.DOWNLOAD_FAILED),
    };
  }

  private async store(
    file: IDriveTreeFile,
    indexed: IIndexedProjectDocument,
  ): Promise<IProjectDocumentFileOutcome> {
    const lockKey = [
      PROJECT_DOCUMENT_LOCK_PREFIX,
      indexed.document.projectId,
      indexed.document.fileId,
    ].join(':');

    await this.transactions.run(async (transaction) => {
      await this.transactions.lockKey(lockKey, transaction);
      await this.repository.replaceDocument(indexed, transaction);
    });

    this.logger.info({
      fileId: file.id,
      status: indexed.document.status,
      pageCount: indexed.document.pageCount,
      message: 'Indexed project document',
    });

    return {
      completed: true,
      skip: toDocumentSkip(file, indexed.document.status),
    };
  }

  private async download(
    projectId: string,
    file: IDriveTreeFile,
    fileSignal: AbortSignal,
  ): Promise<Buffer | null> {
    try {
      return await withAbort(
        this.projectDriveService.downloadProjectFile({
          projectId,
          fileId: file.id,
          signal: fileSignal,
          maxBytes: PROJECT_DOCUMENT_LIMITS.MAX_FILE_BYTES,
        }),
        fileSignal,
      );
    } catch (error) {
      this.logger.error({
        error,
        fileId: file.id,
        interrupted: fileSignal.aborted,
        message: 'Project document download failed; reporting it as skipped',
      });

      return null;
    }
  }

  private async extract(
    file: IDriveTreeFile,
    content: Buffer,
    fileSignal: AbortSignal,
  ): Promise<IExtractedPdf | null> {
    try {
      return await extractPdfPages(content, {
        maxPages: PROJECT_DOCUMENT_LIMITS.MAX_PAGES,
        signal: signalWithTimeout(
          fileSignal,
          PROJECT_DOCUMENT_LIMITS.EXTRACTION_TIMEOUT_MS,
        ),
      });
    } catch (error) {
      this.logger.error({
        error,
        fileId: file.id,
        interrupted: fileSignal.aborted,
        message: 'Project document text extraction failed; marking unreadable',
      });

      return null;
    }
  }
}
