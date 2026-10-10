import { buildFolderTree } from './drive-template-tree.utility';
import { IDriveTemplateFolder } from '../interfaces/drive-template-folder.interface';

const CREATED_AT = new Date('2026-10-07T00:00:00.000Z');

const buildFolder = (
  folder: Pick<IDriveTemplateFolder, 'id' | 'name' | 'parentId' | 'position'>,
): IDriveTemplateFolder => ({
  ...folder,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
});

describe('buildFolderTree', () => {
  it('nests children under their parent ordered by position', () => {
    const folders = [
      buildFolder({ id: 'cad', name: 'CAD', parentId: 'eng', position: 2 }),
      buildFolder({ id: 'ord', name: '02', parentId: null, position: 2 }),
      buildFolder({ id: 'eng', name: '01', parentId: null, position: 1 }),
      buildFolder({ id: 'calc', name: 'Calc', parentId: 'eng', position: 1 }),
    ];

    const tree = buildFolderTree(folders);

    expect(tree.map((node) => node.name)).toEqual(['01', '02']);
    expect(tree[0].children.map((node) => node.name)).toEqual(['Calc', 'CAD']);
    expect(tree[1].children).toEqual([]);
  });

  it('returns an empty tree for no folders', () => {
    expect(buildFolderTree([])).toEqual([]);
  });
});
