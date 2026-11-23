import { GoogleDriveService } from './google-drive.service';
import { GOOGLE_DRIVE } from '@Constants/google-drive.constant';
import { PUBLICATION_LIMITS } from '@Modules/quotation-publication/constants/publication.constant';

const generate = jest.fn<Promise<unknown>, [unknown, unknown]>();
const get = jest.fn<Promise<unknown>, [unknown, unknown]>();
const create = jest.fn<Promise<unknown>, [unknown, unknown]>();
const update = jest.fn<Promise<unknown>, [unknown, unknown]>();
const revisionGet = jest.fn<Promise<unknown>, [unknown, unknown]>();
const revisionUpdate = jest.fn<Promise<unknown>, [unknown, unknown]>();
jest.mock('@googleapis/drive', (): object => ({
  drive: (): object => ({
    files: { get, create, update, generateIds: generate },
    revisions: { get: revisionGet, update: revisionUpdate },
  }),
  auth: { GoogleAuth: jest.fn() },
}));
beforeEach((): void => {
  jest.clearAllMocks();
});
describe('Google publication protocol', (): void => {
  it('reserves the identity and creates exact PDF media without an automatic transport retry', async (): Promise<void> => {
    const service = new GoogleDriveService();
    generate.mockResolvedValue({ data: { ids: ['reserved'] } });
    create.mockResolvedValue({ data: { id: 'reserved' } });
    expect(await service.reservePublicationId()).toBe('reserved');
    await service.createPublicationFile({
      id: 'reserved',
      name: 'frozen.pdf',
      parentId: 'role-folder',
      mimeType: GOOGLE_DRIVE.PDF_MIME_TYPE,
      properties: { publicationCycle: 'cycle' },
      bytes: Buffer.from('%PDF-1.7'),
    });
    const request = create.mock.calls[0][0];
    expect(request).toHaveProperty('keepRevisionForever', true);
    expect(request).toHaveProperty('requestBody.id', 'reserved');
    expect(request).toHaveProperty('requestBody.parents', ['role-folder']);
    expect(request).toHaveProperty(
      'requestBody.appProperties.publicationCycle',
      'cycle',
    );
    expect(create.mock.calls[0][1]).toEqual({
      timeout: PUBLICATION_LIMITS.DRIVE_TIMEOUT_MS,
      retry: false,
    });
  });
  it('requires read-back pin and exact revision checksum proof', async (): Promise<void> => {
    const service = new GoogleDriveService();
    revisionUpdate.mockResolvedValue({
      data: { id: 'revision', keepForever: true },
    });
    revisionGet.mockResolvedValue({
      data: {
        id: 'revision',
        keepForever: true,
        md5Checksum: 'accepted-checksum',
      },
    });
    await service.retainPublicationRevision(
      'file',
      'revision',
      'accepted-checksum',
    );
    expect(revisionGet).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: 'file',
        revisionId: 'revision',
        fields: 'id,keepForever,md5Checksum',
      }),
      expect.objectContaining({ retry: false }),
    );
    revisionGet.mockResolvedValue({
      data: { id: 'revision', keepForever: true, md5Checksum: 'different' },
    });
    await expect(
      service.retainPublicationRevision(
        'file',
        'revision',
        'accepted-checksum',
      ),
    ).rejects.toThrow('retain');
    revisionGet.mockResolvedValue({
      data: {
        id: 'revision',
        keepForever: false,
        md5Checksum: 'accepted-checksum',
      },
    });
    await expect(
      service.retainPublicationRevision(
        'file',
        'revision',
        'accepted-checksum',
      ),
    ).rejects.toThrow('retain');
  });
  it('does not remove an already-correct destination parent or silently recreate a missing file', async (): Promise<void> => {
    const service = new GoogleDriveService();
    update.mockResolvedValue({ data: { id: 'file' } });
    await service.movePublicationFile('file', ['destination'], 'destination');
    expect(update.mock.calls[0][0]).not.toHaveProperty('removeParents');
    expect(update.mock.calls[0][0]).not.toHaveProperty('addParents');
    get.mockRejectedValue({ status: 404 });
    expect(await service.inspectPublicationFile('file')).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });
  it('stops starting publication requests while draining', async (): Promise<void> => {
    const service = new GoogleDriveService();
    service.stopPublicationEffects();
    await expect(service.reservePublicationId()).rejects.toThrow('draining');
    await expect(service.listPublicationChildren('root')).rejects.toThrow(
      'draining',
    );
    expect(generate).not.toHaveBeenCalled();
  });
  it('propagates permission denial and failed pinning without claiming retention', async (): Promise<void> => {
    const service = new GoogleDriveService();
    get.mockRejectedValue({ code: 403 });
    await expect(service.inspectPublicationFile('hidden')).rejects.toEqual({
      code: 403,
    });
    revisionUpdate.mockRejectedValue(new Error('revision pin limit'));
    await expect(
      service.retainPublicationRevision('file', 'revision', 'checksum'),
    ).rejects.toThrow('revision pin limit');
  });
});
