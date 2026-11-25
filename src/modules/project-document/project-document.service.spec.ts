import {
  PROJECT_DOCUMENT_LIMITS,
  PROJECT_DOCUMENT_STATUSES,
  PROJECT_DOCUMENT_SKIP_REASONS,
} from './constants/project-document.constant';

import {
  TProjectDocumentState,
  IIndexedProjectDocument,
  IProjectDocumentPageMatch,
  IProjectDocumentPageSearch,
} from './interfaces/project-document.interface';

import { Test } from '@nestjs/testing';
import { Sequelize, Transaction } from 'sequelize';
import { extractPdfPages } from './utilities/pdf-text.utility';
import { ProjectDocumentService } from './project-document.service';
import { IDriveTreeFile } from '@Interfaces/google-drive.interface';
import { ProjectDocumentRepository } from './project-document.repository';
import { ProjectDriveService } from '@Modules/project-drive/project-drive.service';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';

jest.mock('./utilities/pdf-text.utility');

const PROJECT_ID = '00000000-0000-4000-8000-0000000000a1';
const MODIFIED_AT = new Date('2026-11-20T10:00:00Z');
const PAGE_TEXT = 'מפרט טכני למזגן מרכזי בקומה השלישית';

const pdfFile = (
  id: string,
  overrides: Partial<IDriveTreeFile> = {},
): IDriveTreeFile => ({
  id,
  size: 1000,
  isFolder: false,
  name: `${id}.pdf`,
  md5Checksum: `md5-${id}`,
  folderPath: 'תוכניות',
  modifiedTime: MODIFIED_AT,
  mimeType: 'application/pdf',
  webViewLink: `https://drive.google.com/file/d/${id}/view`,
  ...overrides,
});

const storedState = (
  file: IDriveTreeFile,
  status: TProjectDocumentState['status'] = PROJECT_DOCUMENT_STATUSES.INDEXED,
): TProjectDocumentState => ({
  status,
  fileId: file.id,
  md5Checksum: file.md5Checksum,
  driveModifiedTime: file.modifiedTime,
});

describe('ProjectDocumentService on-demand indexing', () => {
  const database = new Sequelize({ dialect: 'postgres', logging: false });
  const transaction = new Transaction(database, {});
  const extractPdfPagesMock = jest.mocked(extractPdfPages);
  const repository = {
    findStates: jest.fn<Promise<TProjectDocumentState[]>, [string]>(),
    deleteDocuments: jest.fn<Promise<void>, [string, string[]]>(),
    replaceDocument: jest.fn<
      Promise<void>,
      [IIndexedProjectDocument, Transaction]
    >(),
    searchPages: jest.fn<
      Promise<IProjectDocumentPageMatch[]>,
      [IProjectDocumentPageSearch]
    >(),
  };
  const projectDrive = {
    listProjectFiles: jest.fn<Promise<IDriveTreeFile[]>, [string]>(),
    downloadListedProjectFile: jest.fn<
      Promise<Buffer>,
      [IDriveTreeFile, number]
    >(),
  };
  const transactions = {
    lockKey: jest.fn<Promise<void>, [string, Transaction]>(),
    run: jest.fn(
      (work: (transaction: Transaction) => Promise<void>): Promise<void> =>
        work(transaction),
    ),
  };
  const state: { service: ProjectDocumentService | null } = { service: null };
  const search = (query: string) =>
    state.service!.search({ query, projectId: PROJECT_ID });
  const indexedFileIds = () =>
    repository.replaceDocument.mock.calls.map(
      ([indexed]) => indexed.document.fileId,
    );

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ProjectDocumentService,
        { provide: ProjectDocumentRepository, useValue: repository },
        { provide: ProjectDriveService, useValue: projectDrive },
        { provide: DatabaseTransactionService, useValue: transactions },
      ],
    }).compile();
    state.service = module.get(ProjectDocumentService);
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    repository.searchPages.mockResolvedValue([]);
    repository.deleteDocuments.mockResolvedValue();
    repository.replaceDocument.mockResolvedValue();
    transactions.lockKey.mockResolvedValue();
    projectDrive.downloadListedProjectFile.mockResolvedValue(
      Buffer.from('%PDF'),
    );
    extractPdfPagesMock.mockResolvedValue({
      totalPages: 1,
      pages: [PAGE_TEXT],
    });
  });

  it('does not download or re-extract files whose checksum and modified time are unchanged', async () => {
    const unchanged = pdfFile('unchanged');
    projectDrive.listProjectFiles.mockResolvedValue([unchanged]);
    repository.findStates.mockResolvedValue([storedState(unchanged)]);

    const result = await search('מזגן');

    expect(projectDrive.downloadListedProjectFile).not.toHaveBeenCalled();
    expect(extractPdfPagesMock).not.toHaveBeenCalled();
    expect(repository.replaceDocument).not.toHaveBeenCalled();
    expect(result).toEqual({ hits: [], skipped: [], pendingFiles: 0 });
  });

  it.each([
    ['checksum', { md5Checksum: 'md5-new' }],
    ['modified time', { modifiedTime: new Date('2026-11-21T10:00:00Z') }],
  ])(
    're-extracts only the file whose %s changed',
    async (_change, overrides) => {
      const unchanged = pdfFile('unchanged');
      const changed = pdfFile('changed', overrides);
      projectDrive.listProjectFiles.mockResolvedValue([unchanged, changed]);
      repository.findStates.mockResolvedValue([
        storedState(unchanged),
        storedState(pdfFile('changed')),
      ]);

      await search('מזגן');

      expect(projectDrive.downloadListedProjectFile).toHaveBeenCalledTimes(1);
      expect(projectDrive.downloadListedProjectFile).toHaveBeenCalledWith(
        changed,
        PROJECT_DOCUMENT_LIMITS.MAX_FILE_BYTES,
      );
      expect(repository.replaceDocument).toHaveBeenCalledTimes(1);
      expect(repository.replaceDocument).toHaveBeenCalledWith(
        {
          document: {
            fileId: 'changed',
            pageCount: 1,
            projectId: PROJECT_ID,
            status: PROJECT_DOCUMENT_STATUSES.INDEXED,
            md5Checksum: changed.md5Checksum,
            driveModifiedTime: changed.modifiedTime,
          },
          pages: [
            {
              pageNumber: 1,
              text: PAGE_TEXT,
              fileId: 'changed',
              projectId: PROJECT_ID,
            },
          ],
        },
        transaction,
      );
    },
  );

  it('indexes new PDFs, ignores non-PDF files and drops removed files from the index', async () => {
    const newFile = pdfFile('new');
    const spreadsheet = pdfFile('sheet', { mimeType: 'text/csv' });
    projectDrive.listProjectFiles.mockResolvedValue([newFile, spreadsheet]);
    repository.findStates.mockResolvedValue([storedState(pdfFile('removed'))]);

    await search('מזגן');

    expect(repository.deleteDocuments).toHaveBeenCalledWith(PROJECT_ID, [
      'removed',
    ]);
    expect(projectDrive.downloadListedProjectFile).toHaveBeenCalledTimes(1);
    expect(projectDrive.downloadListedProjectFile).toHaveBeenCalledWith(
      newFile,
      PROJECT_DOCUMENT_LIMITS.MAX_FILE_BYTES,
    );
    expect(transactions.lockKey).toHaveBeenCalledWith(
      `project-document:${PROJECT_ID}:new`,
      transaction,
    );
  });

  it('remembers scanned and oversized files and reports them without retrying', async () => {
    const scanned = pdfFile('scanned');
    const oversized = pdfFile('oversized', {
      size: PROJECT_DOCUMENT_LIMITS.MAX_FILE_BYTES + 1,
    });
    const previouslyScanned = pdfFile('old-scan');
    projectDrive.listProjectFiles.mockResolvedValue([
      scanned,
      oversized,
      previouslyScanned,
    ]);
    repository.findStates.mockResolvedValue([
      storedState(previouslyScanned, PROJECT_DOCUMENT_STATUSES.SCANNED),
    ]);
    extractPdfPagesMock.mockResolvedValue({
      totalPages: 3,
      pages: ['', ' ', ''],
    });

    const result = await search('x');

    expect(projectDrive.downloadListedProjectFile).toHaveBeenCalledTimes(1);
    expect(
      repository.replaceDocument.mock.calls.map(([indexed]) => ({
        pages: indexed.pages,
        status: indexed.document.status,
        fileId: indexed.document.fileId,
      })),
    ).toEqual([
      {
        pages: [],
        fileId: 'scanned',
        status: PROJECT_DOCUMENT_STATUSES.SCANNED,
      },
      {
        pages: [],
        fileId: 'oversized',
        status: PROJECT_DOCUMENT_STATUSES.TOO_LARGE,
      },
    ]);
    expect(result.skipped).toEqual([
      {
        fileId: 'old-scan',
        fileName: 'old-scan.pdf',
        reason: PROJECT_DOCUMENT_STATUSES.SCANNED,
      },
      {
        fileId: 'scanned',
        fileName: 'scanned.pdf',
        reason: PROJECT_DOCUMENT_STATUSES.SCANNED,
      },
      {
        fileId: 'oversized',
        fileName: 'oversized.pdf',
        reason: PROJECT_DOCUMENT_STATUSES.TOO_LARGE,
      },
    ]);
  });

  it('marks unreadable PDFs and reports transient download failures without persisting them', async () => {
    const unreadable = pdfFile('unreadable');
    const unreachable = pdfFile('unreachable');
    projectDrive.listProjectFiles.mockResolvedValue([unreadable, unreachable]);
    repository.findStates.mockResolvedValue([]);
    extractPdfPagesMock.mockRejectedValueOnce(new Error('Invalid PDF'));
    projectDrive.downloadListedProjectFile
      .mockResolvedValueOnce(Buffer.from('broken'))
      .mockRejectedValueOnce(new Error('Drive unavailable'));

    const result = await search('x');

    expect(indexedFileIds()).toEqual(['unreadable']);
    expect(result.skipped).toEqual([
      {
        fileId: 'unreadable',
        fileName: 'unreadable.pdf',
        reason: PROJECT_DOCUMENT_STATUSES.UNREADABLE,
      },
      {
        fileId: 'unreachable',
        fileName: 'unreachable.pdf',
        reason: PROJECT_DOCUMENT_SKIP_REASONS.DOWNLOAD_FAILED,
      },
    ]);
  });

  it('bounds indexing work per request and reports the remaining files as pending', async () => {
    const files = Array.from(
      { length: PROJECT_DOCUMENT_LIMITS.MAX_FILES_PER_REFRESH + 2 },
      (_value, index) => pdfFile(`file-${index}`),
    );
    projectDrive.listProjectFiles.mockResolvedValue(files);
    repository.findStates.mockResolvedValue([]);

    const result = await search('x');

    expect(projectDrive.downloadListedProjectFile).toHaveBeenCalledTimes(
      PROJECT_DOCUMENT_LIMITS.MAX_FILES_PER_REFRESH,
    );
    expect(result.pendingFiles).toBe(2);
  });

  it('returns search hits enriched with the current Drive name, folder and link', async () => {
    const file = pdfFile('plan');
    projectDrive.listProjectFiles.mockResolvedValue([file]);
    repository.findStates.mockResolvedValue([storedState(file)]);
    repository.searchPages.mockResolvedValue([
      { fileId: 'plan', pageNumber: 4, snippet: '«מזגן» מרכזי' },
      { fileId: 'deleted-meanwhile', pageNumber: 1, snippet: 'x' },
    ]);

    const result = await search('מזגן');

    expect(repository.searchPages).toHaveBeenCalledWith({
      query: 'מזגן',
      projectId: PROJECT_ID,
      limit: PROJECT_DOCUMENT_LIMITS.MAX_SEARCH_HITS,
    });
    expect(result.hits).toEqual([
      {
        page: 4,
        fileId: 'plan',
        fileName: 'plan.pdf',
        folderPath: 'תוכניות',
        snippet: '«מזגן» מרכזי',
        url: file.webViewLink,
      },
    ]);
  });

  it('repairs visual-order Hebrew lines before storing page text', async () => {
    const file = pdfFile('reversed');
    projectDrive.listProjectFiles.mockResolvedValue([file]);
    repository.findStates.mockResolvedValue([]);
    extractPdfPagesMock.mockResolvedValue({
      totalPages: 1,
      pages: ['ןגזמ לש םגדה\nModel VRF-200'],
    });

    await search('מזגן');

    expect(
      repository.replaceDocument.mock.calls[0][0].pages.map(
        (page) => page.text,
      ),
    ).toEqual(['הדגם של מזגן\nModel VRF-200']);
  });
});
