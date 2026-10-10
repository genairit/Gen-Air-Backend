export interface IDriveTemplateFolder {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  position: number;
  parentId: string | null;
}

export interface IDriveTemplateFolderNode extends IDriveTemplateFolder {
  children: IDriveTemplateFolderNode[];
}

export type TDriveTemplateFolderCreationAttributes = Pick<
  IDriveTemplateFolder,
  'name' | 'parentId' | 'position'
>;
