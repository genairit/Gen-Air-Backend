import {
  PROJECT_DOCUMENT_LIMITS,
  PROJECT_DOCUMENT_STATUSES,
  PROJECT_DOCUMENT_LOCK_PREFIX,
  PROJECT_DOCUMENT_SKIP_REASONS,
} from './constants/project-document.constant';

import {
  IExtractedPdf,
  IProjectDocumentSkip,
  IProjectDocumentSearch,
  IIndexedProjectDocument,
  IProjectDocumentRefresh,
  IProjectDocumentSearchRequest,
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
import { Meta, TypedLogger } from '@Logger/logger.service';
import { extractPdfPages } from './utilities/pdf-text.utility';
import { IDriveTreeFile } from '@Interfaces/google-drive.interface';
import { ProjectDocumentRepository } from './project-document.repository';
import { ProjectDriveService } from '@Modules/project-drive/project-drive.service';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';

interface IDocumentIndexBatch {
  deadline: number;
  projectId: string;
  files: IDriveTreeFile[];
}

type TDocumentIndexOutcome = IProjectDocumentSkip | null;

@Injectable()
export class ProjectDocumentService {
  private readonly logger = new TypedLogger<Meta>(ProjectDocumentService.name);

  constructor(
    private readonly repository: ProjectDocumentRepository,
    private readonly projectDriveService: ProjectDriveService,
    private readonly transactions: DatabaseTransactionService,
  ) {}

  async search(
    request: IProjectDocumentSearchRequest,
  ): Promise<IProjectDocumentSearch> {
    const projectFiles = await this.projectDriveService.listProjectFiles(
      request.projectId,
    );
    const pdfFiles = projectFiles.filter(isPdfFile);
    const refresh = await this.refreshIndex(request.projectId, pdfFiles);
    const matches = await this.repository.searchPages({
      query: request.query,
      projectId: request.projectId,
      limit: PROJECT_DOCUMENT_LIMITS.MAX_SEARCH_HITS,
    });

    return { ...refresh, hits: toDocumentHits(matches, pdfFiles) };
  }

  private async refreshIndex(
    projectId: string,
    files: IDriveTreeFile[],
  ): Promise<IProjectDocumentRefresh> {
    const storedDocuments = await this.repository.findStates(projectId);
    const plan = planDocumentIndex(files, storedDocuments);

    await this.repository.deleteDocuments(projectId, plan.removedFileIds);

    const outcomes = await this.indexWithinBudget({
      projectId,
      files: plan.stale.slice(0, PROJECT_DOCUMENT_LIMITS.MAX_FILES_PER_REFRESH),
      deadline: Date.now() + PROJECT_DOCUMENT_LIMITS.REFRESH_BUDGET_MS,
    });
    const newSkips = outcomes.flatMap((outcome) => outcome ?? []);

    return {
      pendingFiles: plan.stale.length - outcomes.length,
      skipped: [...toStoredSkips(plan.unchanged, storedDocuments), ...newSkips],
    };
  }

  private async indexWithinBudget(
    batch: IDocumentIndexBatch,
  ): Promise<TDocumentIndexOutcome[]> {
    const [file, ...remainingFiles] = batch.files;
    const isOutOfTime = Date.now() >= batch.deadline;

    if (!file || isOutOfTime) {
      return [];
    }

    const outcome = await this.indexFile(batch.projectId, file);
    const remainingOutcomes = await this.indexWithinBudget({
      ...batch,
      files: remainingFiles,
    });

    return [outcome, ...remainingOutcomes];
  }

  private async indexFile(
    projectId: string,
    file: IDriveTreeFile,
  ): Promise<TDocumentIndexOutcome> {
    if (isOversizedFile(file)) {
      return this.store(
        file,
        buildUnindexedDocument(
          projectId,
          file,
          PROJECT_DOCUMENT_STATUSES.TOO_LARGE,
        ),
      );
    }

    const content = await this.download(file);

    if (!content) {
      return toDocumentSkip(
        file,
        PROJECT_DOCUMENT_SKIP_REASONS.DOWNLOAD_FAILED,
      );
    }

    const extracted = await this.extract(file, content);

    return this.store(file, buildIndexedDocument(projectId, file, extracted));
  }

  private async store(
    file: IDriveTreeFile,
    indexed: IIndexedProjectDocument,
  ): Promise<TDocumentIndexOutcome> {
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

    return toDocumentSkip(file, indexed.document.status);
  }

  private async download(file: IDriveTreeFile): Promise<Buffer | null> {
    try {
      return await this.projectDriveService.downloadListedProjectFile(
        file,
        PROJECT_DOCUMENT_LIMITS.MAX_FILE_BYTES,
      );
    } catch (error) {
      this.logger.error({
        error,
        fileId: file.id,
        message: 'Project document download failed; reporting it as skipped',
      });

      return null;
    }
  }

  private async extract(
    file: IDriveTreeFile,
    content: Buffer,
  ): Promise<IExtractedPdf | null> {
    try {
      return await extractPdfPages(content, {
        maxPages: PROJECT_DOCUMENT_LIMITS.MAX_PAGES,
        timeoutMs: PROJECT_DOCUMENT_LIMITS.EXTRACTION_TIMEOUT_MS,
      });
    } catch (error) {
      this.logger.error({
        error,
        fileId: file.id,
        message: 'Project document text extraction failed; marking unreadable',
      });

      return null;
    }
  }
}
