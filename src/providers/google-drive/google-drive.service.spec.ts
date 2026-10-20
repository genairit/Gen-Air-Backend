import {
  DRIVE_CONNECTION_STATUS,
  DRIVE_CONNECTION_METADATA_FIELDS,
} from './constants/drive-connection.constant';

import { GoogleDriveService } from './google-drive.service';
import { GOOGLE_DRIVE } from '@Constants/google-drive.constant';
import { EnvironmentManager } from '@Utilities/environment-manager.utility';

const mockGet = jest.fn();
const mockList = jest.fn();
const mockCreate = jest.fn();
jest.mock('@googleapis/drive', () => ({
  drive: () => ({
    files: { get: mockGet, list: mockList, create: mockCreate },
  }),
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

describe('Google Drive project folder identity', () => {
  beforeEach(() => {
    mockList.mockReset();
    mockCreate.mockReset();
  });

  it('reuses the marked project folder after its display name changes', async () => {
    const existingFolder = {
      id: 'project-folder',
      name: 'Original project name',
      mimeType: GOOGLE_DRIVE.FOLDER_MIME_TYPE,
    };
    mockList
      .mockResolvedValueOnce({ data: { files: [] } })
      .mockResolvedValueOnce({ data: { files: [{ id: existingFolder.id }] } });
    mockCreate.mockResolvedValue({ data: existingFolder });
    const service = new GoogleDriveService();

    await expect(
      service.ensureFolder('Original project name', 'root', 'project-1'),
    ).resolves.toBe(existingFolder.id);
    await expect(
      service.ensureFolder('Renamed project', 'root', 'project-1'),
    ).resolves.toBe(existingFolder.id);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          name: 'Original project name',
          parents: ['root'],
          appProperties: { genairProjectId: 'project-1' },
        }),
      }),
    );
    const firstQuery = mockList.mock.calls[0][0].q;
    const retryQuery = mockList.mock.calls[1][0].q;
    expect(retryQuery).toBe(firstQuery);
    expect(retryQuery).toContain("'root' in parents");
    expect(retryQuery).toContain(
      "appProperties has { key='genairProjectId' and value='project-1' }",
    );
    expect(retryQuery).not.toContain('name =');
  });

  it('keeps template folders matched by name without project metadata', async () => {
    mockList.mockResolvedValue({ data: { files: [] } });
    mockCreate.mockResolvedValue({
      data: {
        id: 'template-folder',
        name: 'CAD',
        mimeType: GOOGLE_DRIVE.FOLDER_MIME_TYPE,
      },
    });

    await expect(
      new GoogleDriveService().ensureFolder('CAD', 'project-folder'),
    ).resolves.toBe('template-folder');

    expect(mockList).toHaveBeenCalledWith(
      expect.objectContaining({ q: expect.stringContaining("name = 'CAD'") }),
    );
    expect(mockCreate.mock.calls[0][0].requestBody.appProperties).toBeFalsy();
  });

  it('propagates failed folder creation so the project remains retryable', async () => {
    mockList.mockResolvedValue({ data: { files: [] } });
    mockCreate
      .mockRejectedValueOnce(new Error('Drive unavailable'))
      .mockResolvedValueOnce({
        data: {
          id: 'recovered-folder',
          name: 'New name',
          mimeType: GOOGLE_DRIVE.FOLDER_MIME_TYPE,
        },
      });
    const service = new GoogleDriveService();

    await expect(
      service.ensureFolder('Old name', 'root', 'project-1'),
    ).rejects.toThrow('Drive unavailable');
    await expect(
      service.ensureFolder('New name', 'root', 'project-1'),
    ).resolves.toBe('recovered-folder');

    expect(mockList.mock.calls[0][0].q).toBe(mockList.mock.calls[1][0].q);
  });
});
