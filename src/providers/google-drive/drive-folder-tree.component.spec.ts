import { GoogleDriveService } from './google-drive.service';
import { GOOGLE_DRIVE } from '@Constants/google-drive.constant';

const mockList = jest.fn();
jest.mock('@googleapis/drive', () => ({
  drive: () => ({ files: { list: mockList } }),
  auth: { GoogleAuth: jest.fn() },
}));

const MAX_DEPTH = 10;
const PARENT_CLAUSE = /'([^']+)' in parents/g;

interface IFakeDriveNode {
  id: string;
  parent: string;
  isFolder: boolean;
}

const folder = (id: string, parent: string): IFakeDriveNode => ({
  id,
  parent,
  isFolder: true,
});

const file = (id: string, parent: string): IFakeDriveNode => ({
  id,
  parent,
  isFolder: false,
});

const serveFakeDrive = (nodes: IFakeDriveNode[]) =>
  mockList.mockImplementation(({ q }: { q: string }) => {
    const parentIds = new Set(
      [...q.matchAll(PARENT_CLAUSE)].map((match) => match[1]),
    );
    const children = nodes.filter((node) => parentIds.has(node.parent));

    return Promise.resolve({
      data: {
        files: children.map((node) => ({
          id: node.id,
          parents: [node.parent],
          mimeType: node.isFolder
            ? GOOGLE_DRIVE.FOLDER_MIME_TYPE
            : 'application/pdf',
        })),
      },
    });
  });

describe('GoogleDriveService.countDescendantFiles', () => {
  beforeEach(() => mockList.mockReset());

  it('counts every file below each folder and treats a folder with only empty sub-folders as empty', async () => {
    serveFakeDrive([
      folder('cad', 'plans'),
      file('plan.pdf', 'cad'),
      file('cover.pdf', 'plans'),
      folder('drafts', 'quotes'),
      folder('old', 'drafts'),
    ]);

    const counts = await new GoogleDriveService().countDescendantFiles(
      ['plans', 'quotes', 'invoices'],
      MAX_DEPTH,
    );

    expect(counts).toEqual(
      new Map([
        ['plans', 2],
        ['quotes', 0],
        ['invoices', 0],
      ]),
    );
  });

  it('asks Drive once per tree level instead of once per folder', async () => {
    const topFolders = Array.from({ length: 10 }, (_, index) => `top-${index}`);
    const subFolders = topFolders.flatMap((top) =>
      [1, 2, 3, 4].map((index) => folder(`${top}-sub-${index}`, top)),
    );
    const files = subFolders.map((sub) => file(`${sub.id}.pdf`, sub.id));
    serveFakeDrive([...subFolders, ...files]);

    const counts = await new GoogleDriveService().countDescendantFiles(
      topFolders,
      MAX_DEPTH,
    );

    expect([...counts.values()]).toEqual(Array(10).fill(4));
    expect(mockList).toHaveBeenCalledTimes(2);
  });

  it('splits a wide level into queries of a bounded number of parents', async () => {
    const topFolders = Array.from(
      { length: GOOGLE_DRIVE.PARENTS_PER_QUERY + 1 },
      (_, index) => `top-${index}`,
    );
    serveFakeDrive([]);

    await new GoogleDriveService().countDescendantFiles(topFolders, MAX_DEPTH);

    expect(mockList).toHaveBeenCalledTimes(2);
  });

  it('does not call Drive when there are no folders', async () => {
    await expect(
      new GoogleDriveService().countDescendantFiles([], MAX_DEPTH),
    ).resolves.toEqual(new Map());
    expect(mockList).not.toHaveBeenCalled();
  });

  it('fails instead of reporting empty when the tree is deeper than allowed', async () => {
    serveFakeDrive([folder('level-1', 'plans'), folder('level-2', 'level-1')]);

    await expect(
      new GoogleDriveService().countDescendantFiles(['plans'], 1),
    ).rejects.toThrow('deeper than the supported depth');
  });

  it('propagates Drive failures so the caller can report unknown', async () => {
    mockList.mockRejectedValue(new Error('quota exceeded'));

    await expect(
      new GoogleDriveService().countDescendantFiles(['plans'], MAX_DEPTH),
    ).rejects.toThrow('quota exceeded');
  });
});
