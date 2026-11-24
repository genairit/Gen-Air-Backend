export interface IExistingDriveFolder {
  id: string;
  name: string;
  missingTemplateFolders: string[];
}

export interface IDriveFolderTemplate {
  name: string;
  children: IDriveFolderTemplate[];
}
