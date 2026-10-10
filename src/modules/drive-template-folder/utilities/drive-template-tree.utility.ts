import {
  IDriveTemplateFolder,
  IDriveTemplateFolderNode,
} from '../interfaces/drive-template-folder.interface';

const byPosition = (
  first: IDriveTemplateFolder,
  second: IDriveTemplateFolder,
) => first.position - second.position;

export const buildFolderTree = (
  folders: IDriveTemplateFolder[],
): IDriveTemplateFolderNode[] => {
  const buildChildren = (parentId: string | null): IDriveTemplateFolderNode[] =>
    folders
      .filter((folder) => folder.parentId === parentId)
      .sort(byPosition)
      .map((folder) => ({
        id: folder.id,
        name: folder.name,
        parentId: folder.parentId,
        position: folder.position,
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt,
        children: buildChildren(folder.id),
      }));

  return buildChildren(null);
};
