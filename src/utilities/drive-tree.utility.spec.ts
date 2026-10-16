import { GOOGLE_DRIVE } from '@Constants/google-drive.constant';
import { addFileCounts, tallyTreeLevel } from './drive-tree.utility';

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
