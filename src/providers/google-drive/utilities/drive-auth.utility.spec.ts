import { auth } from '@googleapis/drive';
import { GOOGLE_DRIVE } from '@Constants/google-drive.constant';
import { EnvironmentManager } from '@Utilities/environment-manager.utility';
import { createDriveAuth, parseDriveCredentials } from './drive-auth.utility';

jest.mock('@googleapis/drive', () => ({ auth: { GoogleAuth: jest.fn() } }));
const credentials = {
  type: 'service_account',
  client_email: 'test@example.iam.gserviceaccount.com',
  private_key: 'test-key\nnext-line',
  project_id: 'test-project',
};
describe('Drive credentials', () => {
  afterEach(() => jest.restoreAllMocks());
  it('preserves multiline service-account keys supplied by a deployment secret', () => {
    expect(parseDriveCredentials(JSON.stringify(credentials))).toEqual(
      credentials,
    );
  });
  it.each([
    'not json secret',
    'null',
    '[]',
    '{}',
    '{"type":"authorized_user","private_key":"secret"}',
    '{"type":"service_account","client_email":"","private_key":"secret"}',
  ])('rejects invalid credentials without echoing their contents', (value) => {
    expect(() => parseDriveCredentials(value)).toThrow(
      /GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON/,
    );
    try {
      parseDriveCredentials(value);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).not.toContain('secret');
    }
  });
  it('passes JSON credentials to GoogleAuth when configured', () => {
    jest
      .spyOn(EnvironmentManager, 'get')
      .mockReturnValue(JSON.stringify(credentials));
    createDriveAuth();
    expect(auth.GoogleAuth).toHaveBeenLastCalledWith({
      scopes: [GOOGLE_DRIVE.SCOPE],
      credentials,
    });
  });
  it('keeps Application Default Credentials/file-path behavior when JSON is absent', () => {
    jest.spyOn(EnvironmentManager, 'get').mockReturnValue('');
    createDriveAuth();
    expect(auth.GoogleAuth).toHaveBeenLastCalledWith({
      scopes: [GOOGLE_DRIVE.SCOPE],
    });
  });
});
