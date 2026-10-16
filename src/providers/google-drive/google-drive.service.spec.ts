import {
  DRIVE_CONNECTION_STATUS,
  DRIVE_CONNECTION_METADATA_FIELDS,
} from './constants/drive-connection.constant';

import { GoogleDriveService } from './google-drive.service';
import { GOOGLE_DRIVE } from '@Constants/google-drive.constant';
import { EnvironmentManager } from '@Utilities/environment-manager.utility';

const mockGet = jest.fn();
jest.mock('@googleapis/drive', () => ({
  drive: () => ({ files: { get: mockGet } }),
  auth: { GoogleAuth: jest.fn() },
}));
const folder = {
  id: 'root',
  name: 'Company projects',
  driveId: 'shared-drive',
  mimeType: GOOGLE_DRIVE.FOLDER_MIME_TYPE,
  trashed: false,
  capabilities: {
    canListChildren: true,
    canAddChildren: true,
    canTrashChildren: true,
  },
};
describe('Google Drive read-only readiness', () => {
  beforeEach(() => {
    mockGet.mockReset();
    jest
      .spyOn(EnvironmentManager, 'get')
      .mockImplementation((key) =>
        key === 'GOOGLE_DRIVE_ROOT_FOLDER_ID' ? 'root' : '',
      );
  });
  afterEach(() => jest.restoreAllMocks());
  it('does not contact Google when the root is not configured', async () => {
    jest.spyOn(EnvironmentManager, 'get').mockReturnValue('');
    expect(await new GoogleDriveService().checkConnection()).toMatchObject({
      status: 'not_configured',
      ready: false,
      folder: null,
      writesTested: false,
    });
    expect(mockGet).not.toHaveBeenCalled();
  });
  it('reads only metadata and reports the Shared Drive capabilities', async () => {
    mockGet.mockResolvedValue({ data: folder });
    const result = await new GoogleDriveService().checkConnection();
    expect(result).toMatchObject({
      status: 'ready',
      ready: true,
      writesTested: false,
      folder: { id: 'root', sharedDriveId: 'shared-drive' },
    });
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: 'root',
        supportsAllDrives: true,
        fields: DRIVE_CONNECTION_METADATA_FIELDS,
      }),
    );
  });
  it.each([
    { ...folder, mimeType: 'application/pdf' },
    { ...folder, trashed: true },
    { ...folder, id: null },
  ])('rejects an invalid root without returning it as ready', async (data) => {
    mockGet.mockResolvedValue({ data });
    expect(await new GoogleDriveService().checkConnection()).toMatchObject({
      status: 'invalid_root',
      ready: false,
    });
  });
  it('rejects My Drive and insufficient or missing capabilities', async () => {
    mockGet.mockResolvedValueOnce({ data: { ...folder, driveId: null } });
    expect((await new GoogleDriveService().checkConnection()).status).toBe(
      'unsupported_location',
    );
    mockGet.mockResolvedValueOnce({
      data: {
        ...folder,
        capabilities: { ...folder.capabilities, canTrashChildren: false },
      },
    });
    expect((await new GoogleDriveService().checkConnection()).status).toBe(
      'insufficient_permissions',
    );
    mockGet.mockResolvedValueOnce({ data: { ...folder, capabilities: null } });
    expect((await new GoogleDriveService().checkConnection()).status).toBe(
      'insufficient_permissions',
    );
  });
  it.each([
    [401, DRIVE_CONNECTION_STATUS.AUTHENTICATION_FAILED],
    [403, DRIVE_CONNECTION_STATUS.ACCESS_DENIED],
    [404, DRIVE_CONNECTION_STATUS.ROOT_NOT_FOUND],
    [429, DRIVE_CONNECTION_STATUS.UNAVAILABLE],
    [500, DRIVE_CONNECTION_STATUS.UNAVAILABLE],
  ])('reports Google %s safely', async (status, expected) => {
    mockGet.mockRejectedValue({
      response: { status },
      message: 'private credential detail',
      config: { headers: { Authorization: 'secret-token' } },
    });
    const result = await new GoogleDriveService().checkConnection();
    expect(result.status).toBe(expected);
    expect(JSON.stringify(result)).not.toMatch(
      /secret-token|private credential detail|Authorization/,
    );
  });
  it('reports missing credential files and unknown exceptions without leaking paths', async () => {
    mockGet.mockRejectedValueOnce({
      code: 'ENOENT',
      path: '/private/key.json',
    });
    expect((await new GoogleDriveService().checkConnection()).status).toBe(
      'authentication_failed',
    );
    mockGet.mockRejectedValueOnce(new Error('private credential detail'));
    expect((await new GoogleDriveService().checkConnection()).status).toBe(
      'unavailable',
    );
  });
});
