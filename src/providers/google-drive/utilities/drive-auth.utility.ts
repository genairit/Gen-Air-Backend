import { auth } from '@googleapis/drive';
import { isObject } from '@Utilities/object.utility';
import { GOOGLE_DRIVE } from '@Constants/google-drive.constant';
import { EnvironmentManager } from '@Utilities/environment-manager.utility';
import { IDriveServiceAccountCredentials } from '../interfaces/drive-connection.interface';

const isServiceAccount = (
  value: unknown,
): value is IDriveServiceAccountCredentials => {
  if (!isObject(value)) {
    return false;
  }
  return (
    value.type === 'service_account' &&
    typeof value.client_email === 'string' &&
    value.client_email.trim().length > 0 &&
    typeof value.private_key === 'string' &&
    value.private_key.trim().length > 0 &&
    (value.project_id == null || typeof value.project_id === 'string')
  );
};
export const parseDriveCredentials = (
  json: string,
): IDriveServiceAccountCredentials => {
  try {
    const credentials: unknown = JSON.parse(json);
    if (isServiceAccount(credentials)) {
      return credentials;
    }
  } catch {
    throw new Error(
      'GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON must contain valid service-account JSON',
    );
  }
  throw new Error(
    'GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON requires service_account type, client_email and private_key',
  );
};
export const createDriveAuth = () => {
  const json = EnvironmentManager.get('GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON');
  return new auth.GoogleAuth({
    scopes: [GOOGLE_DRIVE.SCOPE],
    ...(json ? { credentials: parseDriveCredentials(json) } : {}),
  });
};
