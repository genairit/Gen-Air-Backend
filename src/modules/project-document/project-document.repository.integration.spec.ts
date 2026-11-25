import {
  PROJECT_DOCUMENT_STATUSES,
  ProjectDocumentStatusType,
} from './constants/project-document.constant';

import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { TIME_UNITS } from '@Constants/time.constant';
import { ProjectDocument } from './entities/project-document.entity';
import { ProjectDocumentRepository } from './project-document.repository';
import { ProjectDocumentPage } from './entities/project-document-page.entity';
import { IIndexedProjectDocument } from './interfaces/project-document.interface';
import { EmbeddedPostgresFixture } from '../../testing/embedded-postgres.fixture';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';

jest.setTimeout(2 * TIME_UNITS.MINUTE_MS);

const PROJECT_ID = '00000000-0000-4000-8000-0000000000e1';
const OTHER_PROJECT_ID = '00000000-0000-4000-8000-0000000000e2';
const DRIVE_MODIFIED_TIME = new Date('2026-11-20T10:00:00Z');

const currentFile = (id: string) => ({
  id,
  md5Checksum: `md5-${id}`,
  modifiedTime: DRIVE_MODIFIED_TIME,
});
const MIGRATION_PATH = join(
  process.cwd(),
  'migrations',
  '2026-11-25-project-document-search-index.sql',
);
const SUPABASE_BASELINE = `
  CREATE ROLE anon;
  CREATE ROLE authenticated;
  CREATE TABLE public.projects (id uuid PRIMARY KEY);
  INSERT INTO public.projects (id) VALUES ('${PROJECT_ID}'), ('${OTHER_PROJECT_ID}');
`;

const indexedDocument = (
  projectId: string,
  fileId: string,
  pages: string[],
  status: ProjectDocumentStatusType = PROJECT_DOCUMENT_STATUSES.INDEXED,
): IIndexedProjectDocument => ({
  pages: pages.map((text, index) => ({
    text,
    fileId,
    projectId,
    pageNumber: index + 1,
  })),
  document: {
    fileId,
    status,
    projectId,
    pageCount: pages.length,
    md5Checksum: `md5-${fileId}`,
    driveModifiedTime: DRIVE_MODIFIED_TIME,
  },
});

describe('project document search index on PostgreSQL', () => {
  const postgres = new EmbeddedPostgresFixture([
    ProjectDocument,
    ProjectDocumentPage,
  ]);
  const repository = () => new ProjectDocumentRepository(postgres.database());

  const replace = (indexed: IIndexedProjectDocument): Promise<void> => {
    const transactions = new DatabaseTransactionService(postgres.database());

    return transactions.run((transaction) =>
      repository().replaceDocument(indexed, transaction),
    );
  };

  beforeAll(async () => {
    const database = await postgres.start();
    const migration = await readFile(MIGRATION_PATH, 'utf8');
    await database.query(SUPABASE_BASELINE);
    await database.query(migration);
    await database.query(migration);
  });

  afterAll(async () => {
    await postgres.stop();
  });

  beforeEach(async () => {
    await postgres
      .database()
      .query('TRUNCATE public.project_documents CASCADE');
  });

  it('finds Hebrew page text with full-text search and returns a highlighted snippet', async () => {
    await replace(
      indexedDocument(PROJECT_ID, 'plan', [
        'תוכנית קומה ראשונה ללא ציוד',
        'מיקום המעבה על הגג ליד חדר המדרגות. דגם VRF-200',
      ]),
    );

    const matches = await repository().searchPages({
      limit: 5,
      query: 'המעבה',
      files: [currentFile('plan')],
      projectId: PROJECT_ID,
    });

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ fileId: 'plan', pageNumber: 2 });
    expect(matches[0].snippet).toContain('«המעבה»');
  });

  it('matches any query word and ranks pages matching more words first', async () => {
    await replace(
      indexedDocument(PROJECT_ID, 'spec', [
        'לוח חשמל ראשי בקומת הקרקע',
        'לוח חשמל למזגנים ודגם מעבה',
      ]),
    );

    const matches = await repository().searchPages({
      limit: 5,
      projectId: PROJECT_ID,
      query: 'דגם מעבה לוח',
      files: [currentFile('spec')],
    });

    expect(matches.map((match) => match.pageNumber)).toEqual([2, 1]);
  });

  it('tolerates near-miss spellings through trigram word similarity', async () => {
    await replace(
      indexedDocument(PROJECT_ID, 'quote', ['ספק: אלקטרה מיזוג אוויר בע"מ']),
    );

    const matches = await repository().searchPages({
      limit: 5,
      query: 'אלקטרא',
      files: [currentFile('quote')],
      projectId: PROJECT_ID,
    });

    expect(matches.map((match) => match.fileId)).toEqual(['quote']);
  });

  it('never returns pages from another project', async () => {
    await replace(indexedDocument(OTHER_PROJECT_ID, 'secret', ['מעבה סודי']));

    await expect(
      repository().searchPages({
        limit: 5,
        query: 'מעבה',
        files: [currentFile('secret')],
        projectId: PROJECT_ID,
      }),
    ).resolves.toEqual([]);
  });

  it('only ranks pages whose stored versions match the current Drive files', async () => {
    await replace(
      indexedDocument(PROJECT_ID, 'changed-checksum', ['מעבה ישן']),
    );
    await replace(indexedDocument(PROJECT_ID, 'changed-date', ['מעבה ישן']));
    await replace(indexedDocument(PROJECT_ID, 'removed', ['מעבה ישן']));
    await replace(indexedDocument(PROJECT_ID, 'current', ['מעבה זמין']));

    const matches = await repository().searchPages({
      limit: 1,
      query: 'מעבה',
      projectId: PROJECT_ID,
      files: [
        { ...currentFile('changed-checksum'), md5Checksum: 'new-checksum' },
        { ...currentFile('changed-date'), modifiedTime: null },
        currentFile('current'),
      ],
    });

    expect(matches.map(({ fileId }) => fileId)).toEqual(['current']);
  });

  it('handles queries without searchable words safely', async () => {
    await replace(indexedDocument(PROJECT_ID, 'plan', ['מעבה']));

    await expect(
      repository().searchPages({
        limit: 5,
        query: "?! '&|",
        files: [currentFile('plan')],
        projectId: PROJECT_ID,
      }),
    ).resolves.toEqual([]);
  });

  it('replaces a re-indexed document and removes deleted documents with their pages', async () => {
    await replace(indexedDocument(PROJECT_ID, 'plan', ['גרסה ישנה מעבה']));
    await replace(indexedDocument(PROJECT_ID, 'plan', ['גרסה חדשה מאייד']));
    await replace(
      indexedDocument(
        PROJECT_ID,
        'scan',
        [],
        PROJECT_DOCUMENT_STATUSES.SCANNED,
      ),
    );

    await expect(
      repository().searchPages({
        limit: 5,
        query: 'מעבה',
        files: [currentFile('plan')],
        projectId: PROJECT_ID,
      }),
    ).resolves.toEqual([]);
    await expect(repository().findStates(PROJECT_ID)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fileId: 'scan',
          status: PROJECT_DOCUMENT_STATUSES.SCANNED,
        }),
        expect.objectContaining({
          fileId: 'plan',
          md5Checksum: 'md5-plan',
          status: PROJECT_DOCUMENT_STATUSES.INDEXED,
          driveModifiedTime: DRIVE_MODIFIED_TIME,
        }),
      ]),
    );

    await repository().deleteDocuments(PROJECT_ID, ['plan']);

    await expect(ProjectDocumentPage.count()).resolves.toBe(0);
  });

  it('keeps every document when there is nothing to delete', async () => {
    await replace(indexedDocument(PROJECT_ID, 'plan', ['מעבה']));

    await repository().deleteDocuments(PROJECT_ID, []);

    await expect(repository().findStates(PROJECT_ID)).resolves.toHaveLength(1);
    await expect(ProjectDocumentPage.count()).resolves.toBe(1);
  });
});
