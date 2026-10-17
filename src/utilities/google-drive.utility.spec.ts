import {
  toDriveItem,
  buildChildrenQuery,
  isDriveNotFoundError,
  buildChildrenOfAnyQuery,
  buildChildFolderByNameQuery,
} from './google-drive.utility';

import { GOOGLE_DRIVE } from '@Constants/google-drive.constant';

describe('Drive queries', () => {
  it('lists the non-trashed children of a folder', () => {
    expect(buildChildrenQuery('abc123')).toBe(
      "'abc123' in parents and trashed = false",
    );
  });

  it('lists the non-trashed children of several folders in one query', () => {
    expect(buildChildrenOfAnyQuery(['a1', "b'2"])).toBe(
      "('a1' in parents or 'b\\'2' in parents) and trashed = false",
    );
  });

  it('escapes quotes and backslashes in folder names', () => {
    expect(buildChildFolderByNameQuery("O'Neil \\ HQ", 'abc123')).toContain(
      "name = 'O\\'Neil \\\\ HQ'",
    );
  });
});

describe('toDriveItem', () => {
  it('maps a Drive file into an item', () => {
    expect(
      toDriveItem({
        id: 'f1',
        size: '2800000',
        name: 'חישוב.xlsx',
        webViewLink: 'https://drive.google.com/file/d/f1/view',
        modifiedTime: '2026-10-07T10:00:00.000Z',
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    ).toEqual({
      id: 'f1',
      isFolder: false,
      size: 2800000,
      name: 'חישוב.xlsx',
      webViewLink: 'https://drive.google.com/file/d/f1/view',
      modifiedTime: new Date('2026-10-07T10:00:00.000Z'),
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  });

  it('marks folders and fills missing optional fields with null', () => {
    expect(
      toDriveItem({
        id: 'd1',
        name: '01_הנדסה',
        mimeType: GOOGLE_DRIVE.FOLDER_MIME_TYPE,
      }),
    ).toMatchObject({
      size: null,
      isFolder: true,
      webViewLink: null,
      modifiedTime: null,
    });
  });

  it('drops files without an id', () => {
    expect(toDriveItem({ name: 'x', mimeType: 'text/plain' })).toBeNull();
  });
});

describe('isDriveNotFoundError', () => {
  it('recognizes a Drive 404', () => {
    expect(isDriveNotFoundError({ status: 404 })).toBe(true);
  });

  it.each([{ status: 403 }, new Error('network'), null])(
    'does not treat %p as not found',
    (error) => {
      expect(isDriveNotFoundError(error)).toBe(false);
    },
  );
});
