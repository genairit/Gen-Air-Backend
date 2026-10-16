import {
  toProjectDriveFolder,
  toFolderContentStatus,
} from './drive-folder-status.utility';

import { GOOGLE_DRIVE } from '@Constants/google-drive.constant';
import { FOLDER_CONTENT_STATUS } from '../constants/project-drive.constant';

const FOLDER = {
  id: 'plans',
  size: null,
  isFolder: true,
  name: 'תוכניות',
  webViewLink: null,
  modifiedTime: null,
  mimeType: GOOGLE_DRIVE.FOLDER_MIME_TYPE,
};

describe('toFolderContentStatus', () => {
  it('reports content, empty and unknown distinctly', () => {
    expect(toFolderContentStatus(4)).toBe(FOLDER_CONTENT_STATUS.HAS_CONTENT);
    expect(toFolderContentStatus(0)).toBe(FOLDER_CONTENT_STATUS.EMPTY);
    expect(toFolderContentStatus(null)).toBe(FOLDER_CONTENT_STATUS.UNKNOWN);
  });
});

describe('toProjectDriveFolder', () => {
  it('attaches the subtree file count and its status', () => {
    expect(toProjectDriveFolder(FOLDER, new Map([['plans', 3]]))).toEqual({
      id: 'plans',
      fileCount: 3,
      name: 'תוכניות',
      contentStatus: FOLDER_CONTENT_STATUS.HAS_CONTENT,
    });
  });

  it('never reports a folder as empty when its count could not be resolved', () => {
    expect(toProjectDriveFolder(FOLDER, null)).toMatchObject({
      fileCount: null,
      contentStatus: FOLDER_CONTENT_STATUS.UNKNOWN,
    });
    expect(toProjectDriveFolder(FOLDER, new Map())).toMatchObject({
      fileCount: null,
      contentStatus: FOLDER_CONTENT_STATUS.UNKNOWN,
    });
  });
});
