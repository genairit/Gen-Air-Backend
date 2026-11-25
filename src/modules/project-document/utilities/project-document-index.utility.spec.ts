import {
  isSkipReason,
  isOversizedFile,
  hasDocumentChanged,
} from './project-document-index.utility';

import {
  PROJECT_DOCUMENT_STATUSES,
  PROJECT_DOCUMENT_SKIP_REASONS,
} from '../constants/project-document.constant';

import { IDriveTreeFile } from '@Interfaces/google-drive.interface';

const driveFile = (overrides: Partial<IDriveTreeFile>): IDriveTreeFile => ({
  id: 'plan',
  size: null,
  isFolder: false,
  folderPath: '',
  name: 'plan.pdf',
  md5Checksum: null,
  modifiedTime: null,
  webViewLink: null,
  mimeType: 'application/pdf',
  ...overrides,
});

describe('isSkipReason', () => {
  it.each(Object.values(PROJECT_DOCUMENT_SKIP_REASONS))(
    'accepts the skip reason %s',
    (reason) => {
      expect(isSkipReason(reason)).toBe(true);
    },
  );

  it.each([PROJECT_DOCUMENT_STATUSES.INDEXED, 'unknown', '', null])(
    'rejects %p',
    (value) => {
      expect(isSkipReason(value)).toBe(false);
    },
  );

  it('rejects a missing value', () => {
    expect(isSkipReason()).toBe(false);
  });
});

describe('isOversizedFile', () => {
  it('treats a file without a reported size as indexable', () => {
    expect(isOversizedFile(driveFile({ size: null }))).toBe(false);
  });
});

describe('hasDocumentChanged', () => {
  it('treats a file without Drive checksum or modified time as unchanged when both sides lack them', () => {
    expect(
      hasDocumentChanged(
        {
          fileId: 'plan',
          md5Checksum: null,
          driveModifiedTime: null,
          status: PROJECT_DOCUMENT_STATUSES.INDEXED,
        },
        driveFile({}),
      ),
    ).toBe(false);
  });

  it('treats a newly reported modified time as a change', () => {
    expect(
      hasDocumentChanged(
        {
          fileId: 'plan',
          md5Checksum: null,
          driveModifiedTime: null,
          status: PROJECT_DOCUMENT_STATUSES.INDEXED,
        },
        driveFile({ modifiedTime: new Date('2026-11-20T10:00:00Z') }),
      ),
    ).toBe(true);
  });
});
