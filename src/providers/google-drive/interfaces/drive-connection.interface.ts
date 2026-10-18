import { DriveConnectionStatusType } from '../constants/drive-connection.constant';

export interface IDriveConnectionFolder {
  id: string;
  name: string;
  webViewLink: string | null;
  sharedDriveId: string | null;
}
export interface IDriveConnectionCapabilities {
  canAddChildren: boolean;
  canListChildren: boolean;
  canTrashChildren: boolean;
}
export interface IDriveConnectionResult {
  ready: boolean;
  message: string;
  writesTested: false;
  status: DriveConnectionStatusType;
  folder: IDriveConnectionFolder | null;
  capabilities: IDriveConnectionCapabilities | null;
}
export interface IDriveServiceAccountCredentials {
  private_key: string;
  project_id?: string;
  client_email: string;
  type: 'service_account';
}
