import {
  addFileCounts,
  tallyTreeLevel,
  uniqueTreeFiles,
  collectFileTreeLevel,
} from './drive-tree.utility';

import { GOOGLE_DRIVE } from '@Constants/google-drive.constant';

const folder = (id: string, parent: string) => ({
  id,
  parents: [parent],
  mimeType: GOOGLE_DRIVE.FOLDER_MIME_TYPE,
});

const file = (id: string, parent: string) => ({
  id,
  parents: [parent],
  mimeType: 'application/pdf',
});

describe('tallyTreeLevel', () => {
  it('counts files toward the root of their parent and carries sub-folders forward', () => {
    const rootIdByFolderId = new Map([
      ['plans', 'plans'],
      ['cad', 'drawings'],
    ]);

    const level = tallyTreeLevel(
      [file('a', 'plans'), file('b', 'cad'), folder('v2', 'cad')],
      rootIdByFolderId,
    );

    expect(level.fileCounts).toEqual(
      new Map([
        ['plans', 1],
        ['drawings', 1],
      ]),
    );
    expect(level.rootIdByFolderId).toEqual(new Map([['v2', 'drawings']]));
  });

  it('ignores children whose parent is not being walked or that have no id', () => {
    const level = tallyTreeLevel(
      [file('a', 'elsewhere'), { parents: ['plans'], mimeType: 'text/csv' }],
      new Map([['plans', 'plans']]),
    );

    expect(level.fileCounts.size).toBe(0);
    expect(level.rootIdByFolderId.size).toBe(0);
  });
});

describe('addFileCounts', () => {
  it('adds increments to every known root and keeps roots without increments', () => {
    const totals = new Map([
      ['plans', 2],
      ['quotes', 0],
    ]);

    expect(addFileCounts(totals, new Map([['plans', 3]]))).toEqual(
      new Map([
        ['plans', 5],
        ['quotes', 0],
      ]),
    );
  });
});

describe('collectFileTreeLevel', () => {
  const namedFolder = (id: string, name: string, parent: string) => ({
    ...folder(id, parent),
    name,
  });
  const namedFile = (id: string, name: string, parent: string) => ({
    ...file(id, parent),
    name,
    size: '2048',
    md5Checksum: `md5-${id}`,
    modifiedTime: '2026-11-20T10:00:00.000Z',
    webViewLink: `https://drive.google.com/file/d/${id}/view`,
  });

  it('collects files with their folder path and carries nested folder paths forward', () => {
    const level = collectFileTreeLevel(
      [
        namedFile('root-file', 'סיכום.pdf', 'root'),
        namedFile('plan', 'קומה 1.pdf', 'plans'),
        namedFolder('electric', 'חשמל', 'plans'),
      ],
      new Map([
        ['root', ''],
        ['plans', 'תוכניות'],
      ]),
    );

    expect(level.files).toEqual([
      expect.objectContaining({
        id: 'root-file',
        folderPath: '',
        md5Checksum: 'md5-root-file',
      }),
      expect.objectContaining({
        id: 'plan',
        size: 2048,
        name: 'קומה 1.pdf',
        folderPath: 'תוכניות',
        md5Checksum: 'md5-plan',
        modifiedTime: new Date('2026-11-20T10:00:00.000Z'),
      }),
    ]);
    expect(level.folderPaths).toEqual(new Map([['electric', 'תוכניות/חשמל']]));
  });

  it('ignores shortcuts and children outside the walked folders', () => {
    const level = collectFileTreeLevel(
      [
        {
          ...namedFile('shortcut', 'קיצור', 'root'),
          mimeType: GOOGLE_DRIVE.SHORTCUT_MIME_TYPE,
        },
        namedFile('foreign', 'אחר.pdf', 'elsewhere'),
      ],
      new Map([['root', '']]),
    );

    expect(level.files).toEqual([]);
    expect(level.folderPaths.size).toBe(0);
  });

  it('deduplicates files reachable through several parents', () => {
    const level = collectFileTreeLevel(
      [namedFile('shared', 'משותף.pdf', 'root')],
      new Map([['root', '']]),
    );

    expect(uniqueTreeFiles([...level.files, ...level.files])).toHaveLength(1);
  });
});
