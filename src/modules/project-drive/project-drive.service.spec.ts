import {
  ConflictException,
  NotFoundException,
  BadGatewayException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';

import {
  MAX_FOLDER_DEPTH,
  FOLDER_CONTENT_STATUS,
} from './constants/project-drive.constant';

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { Readable } from 'node:stream';
import { mkdtemp, writeFile, access } from 'node:fs/promises';
import { ProjectDriveService } from './project-drive.service';
import { GOOGLE_DRIVE } from '@Constants/google-drive.constant';
import { ProjectService } from '@Modules/project/project.service';
import { IDriveFileMetadata } from '@Interfaces/google-drive.interface';
import { GoogleDriveService } from '@Providers/google-drive/google-drive.service';
import { DriveTemplateFolderService } from '@Modules/drive-template-folder/drive-template-folder.service';

const ROOT_ID = 'projects-root';
const PROJECT_FOLDER_ID = 'project-folder';
const PROJECT = {
  id: 'project-1',
  code: 'אכ-48213',
  name: 'מגדל בבלי',
  driveFolderId: null,
};

const TEMPLATE_TREE = [
  {
    id: 't1',
    name: '01_{Project_ID}',
    children: [{ id: 't2', name: 'CAD', children: [] }],
  },
];

const createService = async () => {
  const projectService = {
    getById: jest.fn().mockResolvedValue(PROJECT),
    setDriveFolderId: jest.fn().mockResolvedValue(null),
    setSharedDocumentFileId: jest.fn().mockResolvedValue(null),
  };
  const googleDriveService = {
    isConfigured: jest.fn().mockReturnValue(true),
    getProjectsRootFolderId: jest.fn().mockReturnValue(ROOT_ID),
    ensureFolder: jest.fn((name: string) => Promise.resolve(`id:${name}`)),
    findParentIds: jest.fn().mockResolvedValue([]),
    listChildren: jest.fn().mockResolvedValue([]),
    getFileMetadata: jest.fn((id: string): Promise<IDriveFileMetadata | null> =>
      Promise.resolve({
        id,
        mimeType: GOOGLE_DRIVE.FOLDER_MIME_TYPE,
        parents: [],
        trashed: false,
      }),
    ),
    moveFile: jest.fn(async (): Promise<void> => {}),
    trashFile: jest.fn(async (): Promise<void> => {}),
    countDescendantFiles: jest.fn().mockResolvedValue(new Map()),
    uploadFile: jest.fn().mockResolvedValue({ id: 'uploaded' }),
  };

  const driveTemplateFolderService = {
    getTree: jest.fn().mockResolvedValue(TEMPLATE_TREE),
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      ProjectDriveService,
      { provide: ProjectService, useValue: projectService },
      { provide: GoogleDriveService, useValue: googleDriveService },
      {
        provide: DriveTemplateFolderService,
        useValue: driveTemplateFolderService,
      },
    ],
  }).compile();

  return {
    service: moduleRef.get(ProjectDriveService),
    projectService,
    googleDriveService,
    driveTemplateFolderService,
  };
};

describe('ProjectDriveService shared parent document', () => {
  const parent = {
    ...PROJECT,
    driveFolderId: PROJECT_FOLDER_ID,
    sharedDocumentFileId: null,
    parentProjectId: null,
    projectType: { canHaveApartments: true },
  };
  const child = {
    ...PROJECT,
    id: 'apartment-1',
    parentProjectId: parent.id,
    sharedDocumentFileId: null,
  };
  const fileId = 'plan-file';
  const nestedFolderId = 'plans-folder';

  const createSharedService = async () => {
    const context = await createService();
    const selectedFile = { id: null as string | null };
    context.projectService.getById.mockImplementation((id: string) =>
      Promise.resolve(
        id === child.id
          ? child
          : { ...parent, sharedDocumentFileId: selectedFile.id },
      ),
    );
    context.projectService.setSharedDocumentFileId.mockImplementation(
      (_id: string, id: string | null) => {
        selectedFile.id = id;
        return Promise.resolve();
      },
    );
    context.googleDriveService.getFileMetadata.mockImplementation(
      (id: string) =>
        Promise.resolve({
          id,
          ...(id === fileId ? { name: 'תוכנית ביצוע.pdf' } : {}),
          trashed: false,
          mimeType:
            id === fileId ? 'application/pdf' : GOOGLE_DRIVE.FOLDER_MIME_TYPE,
          parents: id === fileId ? [nestedFolderId] : [PROJECT_FOLDER_ID],
        }),
    );
    context.googleDriveService.findParentIds.mockImplementation((id: string) =>
      Promise.resolve(id === nestedFolderId ? [PROJECT_FOLDER_ID] : []),
    );
    return context;
  };

  it('selects a nested file once and resolves it live for every apartment', async () => {
    const { service, projectService } = await createSharedService();
    const selected = await service.selectSharedDocument(parent.id, fileId);
    expect(projectService.setSharedDocumentFileId).toHaveBeenCalledWith(
      parent.id,
      fileId,
    );
    expect(selected).toEqual({
      status: 'available',
      file: {
        id: fileId,
        name: 'תוכנית ביצוע.pdf',
        url: `https://drive.google.com/open?id=${fileId}`,
      },
    });
    expect(await service.getSharedDocument(child.id)).toEqual(selected);
  });

  it('replaces and clears the parent selection without writing to apartments', async () => {
    const { service, projectService } = await createSharedService();
    await service.selectSharedDocument(parent.id, fileId);
    await service.selectSharedDocument(parent.id, null);
    expect(await service.getSharedDocument(child.id)).toEqual({
      status: 'none',
      file: null,
    });
    expect(projectService.setSharedDocumentFileId).toHaveBeenLastCalledWith(
      parent.id,
      null,
    );
    expect(projectService.setSharedDocumentFileId).toHaveBeenCalledTimes(2);
  });

  it('rejects an apartment selection and a file outside the parent folder', async () => {
    const { service, googleDriveService, projectService } =
      await createSharedService();
    await expect(
      service.selectSharedDocument(child.id, fileId),
    ).rejects.toThrow(BadRequestException);
    googleDriveService.findParentIds.mockResolvedValue(['another-project']);
    await expect(
      service.selectSharedDocument(parent.id, fileId),
    ).rejects.toThrow(BadRequestException);
    expect(projectService.setSharedDocumentFileId).not.toHaveBeenCalled();
  });

  it('rejects a missing selection before changing the parent', async () => {
    const { service, projectService } = await createSharedService();
    const missingFileId = Reflect.get({}, 'fileId') as string | null;
    await expect(
      service.selectSharedDocument(parent.id, missingFileId),
    ).rejects.toThrow(BadRequestException);
    expect(projectService.setSharedDocumentFileId).not.toHaveBeenCalled();
  });

  it('shows unavailable when a stored selection has no parent Drive folder', async () => {
    const { service, projectService } = await createSharedService();
    projectService.getById.mockImplementation((id: string) =>
      Promise.resolve(
        id === child.id
          ? child
          : {
              ...parent,
              driveFolderId: null,
              sharedDocumentFileId: fileId,
            },
      ),
    );
    expect(await service.getSharedDocument(child.id)).toEqual({
      status: 'unavailable',
      file: null,
    });
  });

  it('reports a missing or moved-out selected file without returning a broken link', async () => {
    const { service, googleDriveService } = await createSharedService();
    await service.selectSharedDocument(parent.id, fileId);
    googleDriveService.getFileMetadata.mockResolvedValue(null);
    expect(await service.getSharedDocument(child.id)).toEqual({
      status: 'unavailable',
      file: null,
    });
    googleDriveService.getFileMetadata.mockResolvedValue({
      id: fileId,
      name: 'תוכנית ביצוע.pdf',
      trashed: false,
      mimeType: 'application/pdf',
      parents: [nestedFolderId],
    });
    googleDriveService.findParentIds.mockResolvedValue(['outside-project']);
    expect(await service.getSharedDocument(child.id)).toEqual({
      status: 'unavailable',
      file: null,
    });
  });
});

const createTempFile = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'project-drive-spec-'));
  const filePath = join(directory, 'upload');

  await writeFile(filePath, '%PDF-1.7\nexample\n%%EOF');

  return filePath;
};

const buildUploadedFile = (path: string): Express.Multer.File => ({
  path,
  size: 7,
  fieldname: 'files',
  encoding: '7bit',
  filename: 'upload',
  destination: tmpdir(),
  mimetype: 'application/pdf',
  originalname: Buffer.from('תוכנית.pdf').toString('latin1'),
  buffer: Buffer.alloc(0),
  stream: Readable.from([]),
});

describe('ProjectDriveService.provision', () => {
  const apartment = {
    ...PROJECT,
    id: 'apartment-1',
    code: 'ד-101',
    name: 'דירה 101',
    parentProjectId: PROJECT.id,
  };

  const createApartmentService = async () => {
    const context = await createService();
    type TProjectFixture = {
      id: string;
      code: string;
      name: string;
      driveFolderId: string | null;
      parentProjectId: string | null;
      projectType: { canHaveApartments: boolean };
    };
    const projects = new Map<string, TProjectFixture>([
      [
        PROJECT.id,
        {
          ...PROJECT,
          parentProjectId: null,
          projectType: { canHaveApartments: true },
        },
      ],
      [
        apartment.id,
        { ...apartment, projectType: { canHaveApartments: false } },
      ],
    ]);
    context.projectService.getById.mockImplementation((id: string) =>
      Promise.resolve(projects.get(id)),
    );
    context.projectService.setDriveFolderId.mockImplementation(
      (id: string, folderId: string) => {
        const project = projects.get(id);
        if (project) {
          projects.set(id, { ...project, driveFolderId: folderId });
        }
        return Promise.resolve();
      },
    );
    context.driveTemplateFolderService.getTree.mockResolvedValue([
      ...TEMPLATE_TREE,
      { id: 'tenants', name: 'דיירים', children: [] },
    ]);
    return { ...context, projects };
  };

  it('creates building tenants and a full apartment template without nested tenants', async () => {
    const { service, googleDriveService, projectService } =
      await createApartmentService();

    await Promise.all([
      service.handleProjectCreated({ projectId: apartment.id }),
      service.provision(apartment.id),
    ]);

    expect(googleDriveService.ensureFolder).toHaveBeenCalledWith(
      'דיירים',
      'id:מגדל בבלי',
    );
    expect(googleDriveService.ensureFolder).toHaveBeenCalledWith(
      apartment.name,
      'id:דיירים',
      apartment.id,
    );
    expect(googleDriveService.ensureFolder).toHaveBeenCalledWith(
      '01_ד-101',
      'id:דירה 101',
    );
    expect(googleDriveService.ensureFolder).toHaveBeenCalledWith(
      'CAD',
      'id:01_ד-101',
    );
    expect(googleDriveService.ensureFolder).not.toHaveBeenCalledWith(
      'דיירים',
      'id:דירה 101',
    );
    expect(projectService.setDriveFolderId).toHaveBeenCalledWith(
      apartment.id,
      'id:דירה 101',
    );
    expect(projectService.setDriveFolderId).toHaveBeenCalledTimes(2);
  });

  it('retries an apartment template failure without changing its folder ID', async () => {
    const { service, googleDriveService, projects } =
      await createApartmentService();
    const failed = { once: false };
    googleDriveService.ensureFolder.mockImplementation(async (name: string) => {
      const apartmentRootCreated =
        googleDriveService.ensureFolder.mock.calls.some(
          ([folderName]) => folderName === apartment.name,
        );
      if (name === 'CAD' && apartmentRootCreated && !failed.once) {
        failed.once = true;
        throw new Error('temporary failure');
      }
      return `id:${name}`;
    });

    await expect(service.provision(apartment.id)).rejects.toThrow(
      BadGatewayException,
    );
    expect(projects.get(apartment.id)?.driveFolderId).toBeNull();

    await service.provision(apartment.id);

    expect(projects.get(apartment.id)?.driveFolderId).toBe('id:דירה 101');
    expect(googleDriveService.ensureFolder).toHaveBeenCalledWith(
      apartment.name,
      'id:דיירים',
      apartment.id,
    );
  });

  it('previews and moves a linked legacy apartment folder with the same ID', async () => {
    const { service, googleDriveService, projects } =
      await createApartmentService();
    await service.provision(PROJECT.id);
    const linkedApartment = projects.get(apartment.id);
    if (!linkedApartment) {
      throw new Error('Missing apartment test fixture');
    }
    projects.set(apartment.id, {
      ...linkedApartment,
      driveFolderId: 'legacy-apartment',
    });
    const folder = { parents: [ROOT_ID] };
    googleDriveService.listChildren.mockImplementation((id: string) =>
      Promise.resolve(
        id === 'id:מגדל בבלי'
          ? [{ id: 'id:דיירים', name: 'דיירים', isFolder: true }]
          : [],
      ),
    );
    googleDriveService.getFileMetadata.mockImplementation((id: string) =>
      Promise.resolve({
        id,
        name: apartment.name,
        mimeType: GOOGLE_DRIVE.FOLDER_MIME_TYPE,
        parents: folder.parents,
        trashed: false,
      }),
    );
    googleDriveService.moveFile.mockImplementation(() => {
      folder.parents = ['id:דיירים'];
      return Promise.resolve();
    });

    const preview = await service.getApartmentFolderRepair(apartment.id);
    expect(preview).toEqual({
      apartmentId: apartment.id,
      buildingId: PROJECT.id,
      sourceFolderId: 'legacy-apartment',
      destinationFolderId: 'id:דיירים',
      status: 'needs_move',
    });
    expect(googleDriveService.moveFile).not.toHaveBeenCalled();
    await expect(service.provision(apartment.id)).rejects.toThrow(
      ConflictException,
    );
    await expect(
      service.repairApartmentFolder(apartment.id, {
        sourceFolderId: 'wrong-folder',
        destinationFolderId: 'id:דיירים',
      }),
    ).rejects.toThrow(ConflictException);
    expect(googleDriveService.moveFile).not.toHaveBeenCalled();

    await service.repairApartmentFolder(apartment.id, preview);
    expect(googleDriveService.moveFile).toHaveBeenCalledWith({
      fileId: 'legacy-apartment',
      parentIds: [ROOT_ID],
      destinationFolderId: 'id:דיירים',
    });
    expect(projects.get(apartment.id)?.driveFolderId).toBe('legacy-apartment');
    expect(googleDriveService.ensureFolder).toHaveBeenCalledWith(
      '01_ד-101',
      'legacy-apartment',
    );
    await service.repairApartmentFolder(apartment.id, preview);
    expect(googleDriveService.moveFile).toHaveBeenCalledTimes(1);
    expect(googleDriveService.trashFile).not.toHaveBeenCalled();

    folder.parents = ['unrelated-folder'];
    await expect(
      service.getApartmentFolderRepair(apartment.id),
    ).rejects.toThrow(ConflictException);
    folder.parents = [ROOT_ID];
    googleDriveService.listChildren.mockImplementation((id: string) =>
      Promise.resolve(
        id === 'id:מגדל בבלי'
          ? [{ id: 'id:דיירים', name: 'דיירים', isFolder: true }]
          : [{ id: 'other-apartment', name: apartment.name, isFolder: true }],
      ),
    );
    await expect(
      service.getApartmentFolderRepair(apartment.id),
    ).rejects.toThrow(ConflictException);
    expect(googleDriveService.moveFile).toHaveBeenCalledTimes(1);
  });

  it('rejects stale folder IDs while a matching repair is in progress', async () => {
    const { service, googleDriveService } = await createService();
    const reviewedRepair = {
      sourceFolderId: 'reviewed-source',
      destinationFolderId: 'reviewed-destination',
    };
    const preview = jest.spyOn(service, 'getApartmentFolderRepair');
    preview.mockResolvedValue({
      apartmentId: PROJECT.id,
      buildingId: 'building-1',
      ...reviewedRepair,
      status: 'already_placed',
    });

    const first = service.repairApartmentFolder(PROJECT.id, reviewedRepair);
    const matching = service.repairApartmentFolder(PROJECT.id, reviewedRepair);
    await expect(
      service.repairApartmentFolder(PROJECT.id, {
        ...reviewedRepair,
        sourceFolderId: 'stale-source',
      }),
    ).rejects.toThrow(ConflictException);
    await expect(
      service.repairApartmentFolder(PROJECT.id, {
        ...reviewedRepair,
        destinationFolderId: 'stale-destination',
      }),
    ).rejects.toThrow(ConflictException);
    await Promise.all([first, matching]);

    expect(preview).toHaveBeenCalledTimes(1);
    expect(googleDriveService.moveFile).not.toHaveBeenCalled();
  });

  it('creates the project folder, saves it, and copies the template tree with tags filled in', async () => {
    const { service, projectService, googleDriveService } =
      await createService();

    await service.provision(PROJECT.id);

    expect(googleDriveService.ensureFolder).toHaveBeenCalledWith(
      'מגדל בבלי',
      ROOT_ID,
      PROJECT.id,
    );
    expect(projectService.setDriveFolderId).toHaveBeenCalledWith(
      PROJECT.id,
      'id:מגדל בבלי',
    );
    expect(googleDriveService.ensureFolder).toHaveBeenCalledWith(
      '01_אכ-48213',
      'id:מגדל בבלי',
    );
    expect(googleDriveService.ensureFolder).toHaveBeenCalledWith(
      'CAD',
      'id:01_אכ-48213',
    );
  });

  it.each([
    'בדיקת פרויקט ראשונה',
    'פרויקט _ 30270 / A & B',
    'Project {Project_ID} $&',
  ])(
    'preserves the exact project name %s when creating its root folder',
    async (name) => {
      const { service, projectService, googleDriveService } =
        await createService();
      projectService.getById.mockResolvedValue({ ...PROJECT, name });

      await service.provision(PROJECT.id);

      expect(googleDriveService.ensureFolder).toHaveBeenNthCalledWith(
        1,
        name,
        ROOT_ID,
        PROJECT.id,
      );
    },
  );

  it('does not link a partially created template and retries the existing folders', async () => {
    const { service, projectService, googleDriveService } =
      await createService();
    const folders = new Map<string, string>();
    googleDriveService.ensureFolder.mockImplementation(async (name: string) => {
      if (name === 'CAD' && !folders.has('failed-once')) {
        folders.set('failed-once', 'true');
        throw new Error('temporary failure');
      }

      const folderId = folders.get(name) ?? `id:${name}`;
      folders.set(name, folderId);
      return folderId;
    });

    await expect(service.provision(PROJECT.id)).rejects.toThrow(
      BadGatewayException,
    );
    expect(projectService.setDriveFolderId).not.toHaveBeenCalled();

    await service.provision(PROJECT.id);

    expect(projectService.setDriveFolderId).toHaveBeenCalledTimes(1);
    expect(projectService.setDriveFolderId).toHaveBeenCalledWith(
      PROJECT.id,
      'id:מגדל בבלי',
    );
    expect(
      googleDriveService.ensureFolder.mock.calls.map(([name]) => name),
    ).toEqual([
      'מגדל בבלי',
      '01_אכ-48213',
      'CAD',
      'מגדל בבלי',
      '01_אכ-48213',
      'CAD',
    ]);
    expect(folders.size).toBe(4);
  });

  it('retains the stable project identity when a retry follows a project rename', async () => {
    const { service, projectService, googleDriveService } =
      await createService();
    googleDriveService.ensureFolder
      .mockResolvedValueOnce(PROJECT_FOLDER_ID)
      .mockRejectedValueOnce(new Error('template failed'));

    await expect(service.provision(PROJECT.id)).rejects.toThrow(
      BadGatewayException,
    );
    projectService.getById.mockResolvedValue({
      ...PROJECT,
      name: 'Renamed project',
    });
    googleDriveService.ensureFolder.mockResolvedValue(PROJECT_FOLDER_ID);

    await service.provision(PROJECT.id);

    expect(googleDriveService.ensureFolder).toHaveBeenCalledWith(
      'מגדל בבלי',
      ROOT_ID,
      PROJECT.id,
    );
    expect(googleDriveService.ensureFolder).toHaveBeenCalledWith(
      'Renamed project',
      ROOT_ID,
      PROJECT.id,
    );
    expect(projectService.setDriveFolderId).toHaveBeenCalledTimes(1);
    expect(projectService.setDriveFolderId).toHaveBeenCalledWith(
      PROJECT.id,
      PROJECT_FOLDER_ID,
    );
  });

  it('links the project only after every template folder succeeds', async () => {
    const { service, projectService, googleDriveService } =
      await createService();
    googleDriveService.ensureFolder.mockImplementation(async (name: string) => {
      expect(projectService.setDriveFolderId).not.toHaveBeenCalled();
      return `id:${name}`;
    });

    await service.provision(PROJECT.id);

    expect(projectService.setDriveFolderId).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent provisioning requests for the same project', async () => {
    const { service, projectService, googleDriveService } =
      await createService();

    await Promise.all([
      service.provision(PROJECT.id),
      service.provision(PROJECT.id),
      service.handleProjectCreated({ projectId: PROJECT.id }),
    ]);

    expect(googleDriveService.ensureFolder).toHaveBeenCalledTimes(3);
    expect(projectService.setDriveFolderId).toHaveBeenCalledTimes(1);
  });

  it('keeps failed provisioning coalesced until pending template siblings finish', async () => {
    const {
      service,
      projectService,
      googleDriveService,
      driveTemplateFolderService,
    } = await createService();
    const pending = {
      release: (_folderId: string) => {},
      started: () => {},
      settled: false,
    };
    const pendingFolder = new Promise<string>((resolve) => {
      pending.release = resolve;
    });
    const folderStarted = new Promise<void>((resolve) => {
      pending.started = resolve;
    });
    driveTemplateFolderService.getTree.mockResolvedValue([
      { id: 'failed', name: 'failed', children: [] },
      { id: 'pending', name: 'pending', children: [] },
    ]);
    googleDriveService.ensureFolder.mockImplementation(async (name: string) => {
      if (name === 'failed') {
        throw new Error('template failed');
      }

      if (name === 'pending') {
        pending.started();
        return pendingFolder;
      }

      return `id:${name}`;
    });
    const provisioning = service
      .provision(PROJECT.id)
      .catch((error: unknown) => {
        pending.settled = true;
        return error;
      });
    await folderStarted;
    await new Promise<void>((resolve) => setImmediate(resolve));
    const retry = service
      .provision(PROJECT.id)
      .catch((error: unknown) => error);
    await new Promise<void>((resolve) => setImmediate(resolve));
    const settledBeforeRelease = pending.settled;
    const ensureCallsBeforeRelease =
      googleDriveService.ensureFolder.mock.calls.length;
    pending.release('pending-folder');

    const results = await Promise.all([provisioning, retry]);

    expect(settledBeforeRelease).toBe(false);
    expect(ensureCallsBeforeRelease).toBe(3);
    expect(results).toEqual([
      expect.any(BadGatewayException),
      expect.any(BadGatewayException),
    ]);
    expect(projectService.setDriveFolderId).not.toHaveBeenCalled();
  });

  it('provisions different projects independently', async () => {
    const { service, projectService, googleDriveService } =
      await createService();
    projectService.getById.mockImplementation(async (id: string) => ({
      ...PROJECT,
      id,
    }));

    await Promise.all([
      service.provision(PROJECT.id),
      service.provision('project-2'),
    ]);

    expect(googleDriveService.ensureFolder).toHaveBeenCalledTimes(6);
    expect(projectService.setDriveFolderId).toHaveBeenCalledWith(
      'project-2',
      expect.any(String),
    );
  });

  it.each([
    new Error(
      'Could not load the default credentials. Browse to https://cloud.google.com/docs/authentication/getting-started',
    ),
    { response: { status: 401 } },
  ])(
    'reports credential failures as an actionable service-unavailable response',
    async (error) => {
      const { service, projectService, googleDriveService } =
        await createService();
      googleDriveService.ensureFolder.mockRejectedValue(error);

      await expect(service.provision(PROJECT.id)).rejects.toMatchObject({
        status: 503,
        response: expect.objectContaining({
          code: 'DRIVE_AUTHENTICATION_FAILED',
        }),
      });
      expect(projectService.setDriveFolderId).not.toHaveBeenCalled();
    },
  );

  it('reuses an existing linked folder without renaming or replacing it', async () => {
    const { service, projectService, googleDriveService } =
      await createService();
    projectService.getById.mockResolvedValue({
      ...PROJECT,
      driveFolderId: PROJECT_FOLDER_ID,
    });

    await service.provision(PROJECT.id);

    expect(projectService.setDriveFolderId).not.toHaveBeenCalled();
    expect(googleDriveService.ensureFolder).not.toHaveBeenCalledWith(
      PROJECT.name,
      ROOT_ID,
      PROJECT.id,
    );
    expect(googleDriveService.ensureFolder).toHaveBeenCalledWith(
      '01_אכ-48213',
      PROJECT_FOLDER_ID,
    );
  });

  it('reports Drive failures as a bad gateway', async () => {
    const { service, googleDriveService } = await createService();
    googleDriveService.ensureFolder.mockRejectedValue(new Error('quota'));

    await expect(service.provision(PROJECT.id)).rejects.toThrow(
      BadGatewayException,
    );
  });

  it('refuses when Drive is not configured', async () => {
    const { service, googleDriveService } = await createService();
    googleDriveService.getProjectsRootFolderId.mockReturnValue(null);

    await expect(service.provision(PROJECT.id)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});

describe('ProjectDriveService.handleProjectCreated', () => {
  it('skips quietly when Drive is not configured', async () => {
    const { service, googleDriveService } = await createService();
    googleDriveService.isConfigured.mockReturnValue(false);

    await service.handleProjectCreated({ projectId: PROJECT.id });

    expect(googleDriveService.ensureFolder).not.toHaveBeenCalled();
  });

  it('does not fail project creation when Drive fails', async () => {
    const { service, googleDriveService } = await createService();
    googleDriveService.ensureFolder.mockRejectedValue(new Error('down'));

    await expect(
      service.handleProjectCreated({ projectId: PROJECT.id }),
    ).resolves.toBeUndefined();
  });
});

describe('ProjectDriveService.getContents', () => {
  it('splits folders with their content status from files', async () => {
    const { service, projectService, googleDriveService } =
      await createService();
    projectService.getById.mockResolvedValue({
      ...PROJECT,
      driveFolderId: PROJECT_FOLDER_ID,
    });
    googleDriveService.listChildren.mockResolvedValue([
      { id: 'd1', name: 'תוכניות', isFolder: true },
      { id: 'd2', name: 'חשבוניות', isFolder: true },
      { id: 'f1', name: 'plan.pdf', isFolder: false },
    ]);
    googleDriveService.countDescendantFiles.mockResolvedValue(
      new Map([
        ['d1', 3],
        ['d2', 0],
      ]),
    );

    await expect(service.getContents(PROJECT.id, {})).resolves.toEqual({
      folderId: PROJECT_FOLDER_ID,
      folders: [
        {
          id: 'd1',
          fileCount: 3,
          name: 'תוכניות',
          contentStatus: FOLDER_CONTENT_STATUS.HAS_CONTENT,
        },
        {
          id: 'd2',
          fileCount: 0,
          name: 'חשבוניות',
          contentStatus: FOLDER_CONTENT_STATUS.EMPTY,
        },
      ],
      files: [{ id: 'f1', name: 'plan.pdf', isFolder: false }],
    });
    expect(googleDriveService.countDescendantFiles).toHaveBeenCalledWith(
      ['d1', 'd2'],
      MAX_FOLDER_DEPTH,
    );
  });

  it('still lists the folder but reports unknown when the content check fails', async () => {
    const { service, projectService, googleDriveService } =
      await createService();
    projectService.getById.mockResolvedValue({
      ...PROJECT,
      driveFolderId: PROJECT_FOLDER_ID,
    });
    googleDriveService.listChildren.mockResolvedValue([
      { id: 'd1', name: 'תוכניות', isFolder: true },
    ]);
    googleDriveService.countDescendantFiles.mockRejectedValue(
      new Error('quota exceeded'),
    );

    await expect(service.getContents(PROJECT.id, {})).resolves.toMatchObject({
      folders: [
        {
          id: 'd1',
          fileCount: null,
          contentStatus: FOLDER_CONTENT_STATUS.UNKNOWN,
        },
      ],
    });
  });

  it('reports a bad gateway when Drive cannot list the folder at all', async () => {
    const { service, projectService, googleDriveService } =
      await createService();
    projectService.getById.mockResolvedValue({
      ...PROJECT,
      driveFolderId: PROJECT_FOLDER_ID,
    });
    googleDriveService.listChildren.mockRejectedValue(new Error('offline'));

    await expect(service.getContents(PROJECT.id, {})).rejects.toThrow(
      BadGatewayException,
    );
  });

  it('does not recreate user-deleted folders during ordinary reads', async () => {
    const { service, projectService, googleDriveService } =
      await createService();
    projectService.getById.mockResolvedValue({
      ...PROJECT,
      driveFolderId: PROJECT_FOLDER_ID,
    });

    await service.getContents(PROJECT.id, {});

    expect(googleDriveService.ensureFolder).not.toHaveBeenCalled();
    expect(projectService.setDriveFolderId).not.toHaveBeenCalled();
    expect(googleDriveService.listChildren).toHaveBeenCalledWith(
      PROJECT_FOLDER_ID,
    );
  });

  it('does not recreate a linked folder that Google reports missing', async () => {
    const { service, projectService, googleDriveService } =
      await createService();
    projectService.getById.mockResolvedValue({
      ...PROJECT,
      driveFolderId: PROJECT_FOLDER_ID,
    });
    googleDriveService.listChildren.mockRejectedValue({
      response: { status: 404 },
    });

    await expect(service.getContents(PROJECT.id, {})).rejects.toThrow(
      BadGatewayException,
    );
    expect(googleDriveService.ensureFolder).not.toHaveBeenCalled();
    expect(projectService.setDriveFolderId).not.toHaveBeenCalled();
  });

  it('rejects a folder outside the project', async () => {
    const { service, projectService, googleDriveService } =
      await createService();
    projectService.getById.mockResolvedValue({
      ...PROJECT,
      driveFolderId: PROJECT_FOLDER_ID,
    });
    googleDriveService.findParentIds.mockResolvedValue(['someone-else']);

    await expect(
      service.getContents(PROJECT.id, { folderId: 'foreign-folder' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('asks to create the folders first when the project has none', async () => {
    const { service, googleDriveService, projectService } =
      await createService();

    await expect(service.getContents(PROJECT.id, {})).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({
        code: 'PROJECT_DRIVE_NOT_PROVISIONED',
        message: expect.not.stringContaining(PROJECT.id),
      }),
    });
    expect(googleDriveService.ensureFolder).not.toHaveBeenCalled();
    expect(projectService.setDriveFolderId).not.toHaveBeenCalled();
  });
});

describe('ProjectDriveService folder scope', () => {
  it('treats a folder Drive cannot find as outside the project', async () => {
    const { service, projectService, googleDriveService } =
      await createService();
    projectService.getById.mockResolvedValue({
      ...PROJECT,
      driveFolderId: PROJECT_FOLDER_ID,
    });
    googleDriveService.findParentIds.mockResolvedValue(null);

    await expect(
      service.getContents(PROJECT.id, { folderId: 'missing-folder' }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('ProjectDriveService.upload', () => {
  it('uploads with the decoded Hebrew name and deletes the temp file', async () => {
    const { service, projectService, googleDriveService } =
      await createService();
    projectService.getById.mockResolvedValue({
      ...PROJECT,
      driveFolderId: PROJECT_FOLDER_ID,
    });
    const tempFilePath = await createTempFile();

    await service.upload(PROJECT.id, {}, [buildUploadedFile(tempFilePath)]);

    expect(googleDriveService.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'תוכנית.pdf',
        mimeType: 'application/pdf',
      }),
    );
    await expect(access(tempFilePath)).rejects.toThrow();
  });

  it('deletes temp files even when the upload is rejected', async () => {
    const { service } = await createService();
    const tempFilePath = await createTempFile();

    await expect(
      service.upload(PROJECT.id, {}, [buildUploadedFile(tempFilePath)]),
    ).rejects.toThrow(ConflictException);
    await expect(access(tempFilePath)).rejects.toThrow();
  });
  it('rejects the entire mixed batch before resolving Drive folders and removes every temporary file', async () => {
    const { service, googleDriveService, projectService } =
      await createService();
    const good = await createTempFile();
    const bad = await createTempFile();
    await writeFile(bad, 'MZ executable');
    await expect(
      service.upload(PROJECT.id, {}, [
        buildUploadedFile(good),
        buildUploadedFile(bad),
      ]),
    ).rejects.toThrow(BadRequestException);
    expect(googleDriveService.uploadFile).not.toHaveBeenCalled();
    expect(projectService.getById).not.toHaveBeenCalled();
    await expect(access(good)).rejects.toThrow();
    await expect(access(bad)).rejects.toThrow();
  });
});

describe('ProjectDriveService.uploadQuotationPdf', () => {
  it('uploads to the linked project quotations folder and removes its temporary file', async () => {
    const { service, projectService, googleDriveService } =
      await createService();
    projectService.getById.mockResolvedValue({
      ...PROJECT,
      driveFolderId: PROJECT_FOLDER_ID,
    });
    const result = await service.uploadQuotationPdf(
      PROJECT.id,
      'הצעת מחיר Q1.pdf',
      Buffer.from('%PDF-1.7'),
    );
    expect(result).toEqual({ id: 'uploaded' });
    expect(googleDriveService.ensureFolder).toHaveBeenCalledWith(
      'הצעות מחיר',
      PROJECT_FOLDER_ID,
    );
    const upload = googleDriveService.uploadFile.mock.calls[0][0];
    expect(upload).toMatchObject({
      parentId: 'id:הצעות מחיר',
      name: 'הצעת מחיר Q1.pdf',
      mimeType: 'application/pdf',
    });
    await expect(access(upload.localPath)).rejects.toThrow();
  });

  it('removes the temporary file when Drive rejects the upload', async () => {
    const { service, projectService, googleDriveService } =
      await createService();
    projectService.getById.mockResolvedValue({
      ...PROJECT,
      driveFolderId: PROJECT_FOLDER_ID,
    });
    googleDriveService.uploadFile.mockRejectedValue(new Error('upload failed'));
    await expect(
      service.uploadQuotationPdf(PROJECT.id, 'Q1.pdf', Buffer.from('%PDF-1.7')),
    ).rejects.toThrow();
    const upload = googleDriveService.uploadFile.mock.calls[0][0];
    await expect(access(upload.localPath)).rejects.toThrow();
  });
});

describe('ProjectDriveService file management', () => {
  const fileId = 'plan-file';
  const sourceFolderId = 'source-folder';
  const destinationFolderId = 'destination-folder';
  const createFileService = async () => {
    const context = await createService();
    context.projectService.getById.mockResolvedValue({
      ...PROJECT,
      driveFolderId: PROJECT_FOLDER_ID,
    });
    context.googleDriveService.getFileMetadata.mockImplementation(
      async (id: string) => ({
        id,
        trashed: false,
        mimeType:
          id === fileId ? 'application/pdf' : GOOGLE_DRIVE.FOLDER_MIME_TYPE,
        parents: id === fileId ? [sourceFolderId] : [PROJECT_FOLDER_ID],
      }),
    );
    context.googleDriveService.findParentIds.mockImplementation(
      async (id: string) =>
        id === sourceFolderId || id === destinationFolderId
          ? [PROJECT_FOLDER_ID]
          : [],
    );
    return context;
  };

  it('moves a project file between validated nested folders', async () => {
    const { service, googleDriveService } = await createFileService();

    await service.moveFile(PROJECT.id, fileId, {
      folderId: destinationFolderId,
    });

    expect(googleDriveService.moveFile).toHaveBeenCalledWith({
      fileId,
      parentIds: [sourceFolderId],
      destinationFolderId,
    });
    expect(googleDriveService.trashFile).not.toHaveBeenCalled();
  });

  it('moves a nested file back to the project root when no folder is supplied', async () => {
    const { service, googleDriveService } = await createFileService();

    await service.moveFile(PROJECT.id, fileId, {});

    expect(googleDriveService.moveFile).toHaveBeenCalledWith({
      fileId,
      parentIds: [sourceFolderId],
      destinationFolderId: PROJECT_FOLDER_ID,
    });
  });

  it('does not mutate a file already in its destination folder', async () => {
    const { service, googleDriveService } = await createFileService();

    await service.moveFile(PROJECT.id, fileId, { folderId: sourceFolderId });

    expect(googleDriveService.moveFile).not.toHaveBeenCalled();
  });

  it('trashes a file only after verifying its project scope', async () => {
    const { service, googleDriveService } = await createFileService();

    await service.trashFile(PROJECT.id, fileId);

    expect(googleDriveService.trashFile).toHaveBeenCalledWith(fileId);
    expect(googleDriveService.moveFile).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', null],
    [
      'trashed',
      { mimeType: 'application/pdf', trashed: true, parents: [sourceFolderId] },
    ],
    [
      'folder',
      {
        mimeType: GOOGLE_DRIVE.FOLDER_MIME_TYPE,
        trashed: false,
        parents: [sourceFolderId],
      },
    ],
    [
      'shortcut',
      {
        mimeType: 'application/vnd.google-apps.shortcut',
        trashed: false,
        parents: [sourceFolderId],
      },
    ],
    [
      'unparented',
      { mimeType: 'application/pdf', trashed: false, parents: [] },
    ],
    [
      'foreign',
      {
        mimeType: 'application/pdf',
        trashed: false,
        parents: ['foreign-folder'],
      },
    ],
    [
      'mixed project parents',
      {
        mimeType: 'application/pdf',
        trashed: false,
        parents: [sourceFolderId, 'foreign-folder'],
      },
    ],
  ])('rejects a %s source before either operation', async (_name, metadata) => {
    const { service, googleDriveService } = await createFileService();
    const defaultMetadata =
      googleDriveService.getFileMetadata.getMockImplementation()!;
    googleDriveService.getFileMetadata.mockImplementation(async (id: string) =>
      id === fileId ? metadata && { id, ...metadata } : defaultMetadata(id),
    );

    const expectedError =
      !metadata || metadata.trashed ? NotFoundException : BadRequestException;
    await expect(service.moveFile(PROJECT.id, fileId, {})).rejects.toThrow(
      expectedError,
    );
    await expect(service.trashFile(PROJECT.id, fileId)).rejects.toThrow(
      expectedError,
    );

    expect(googleDriveService.moveFile).not.toHaveBeenCalled();
    expect(googleDriveService.trashFile).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', null],
    ['trashed', { mimeType: GOOGLE_DRIVE.FOLDER_MIME_TYPE, trashed: true }],
    ['file', { mimeType: 'application/pdf', trashed: false }],
    [
      'shortcut',
      { mimeType: 'application/vnd.google-apps.shortcut', trashed: false },
    ],
  ])('rejects a %s destination before moving', async (_name, metadata) => {
    const { service, googleDriveService } = await createFileService();
    const defaultMetadata =
      googleDriveService.getFileMetadata.getMockImplementation()!;
    googleDriveService.getFileMetadata.mockImplementation(async (id: string) =>
      id === destinationFolderId
        ? metadata && { id, parents: [PROJECT_FOLDER_ID], ...metadata }
        : defaultMetadata(id),
    );

    await expect(
      service.moveFile(PROJECT.id, fileId, { folderId: destinationFolderId }),
    ).rejects.toThrow(
      !metadata || metadata.trashed ? NotFoundException : BadRequestException,
    );

    expect(googleDriveService.moveFile).not.toHaveBeenCalled();
  });

  it('rejects a foreign destination without moving the valid source', async () => {
    const { service, googleDriveService } = await createFileService();

    await expect(
      service.moveFile(PROJECT.id, fileId, { folderId: 'foreign-folder' }),
    ).rejects.toThrow(BadRequestException);

    expect(googleDriveService.moveFile).not.toHaveBeenCalled();
  });

  it.each(['moveFile', 'trashFile'] as const)(
    'does not mutate through %s when Drive is unconfigured or the project is unprovisioned',
    async (operation) => {
      const { service, googleDriveService, projectService } =
        await createFileService();
      googleDriveService.isConfigured.mockReturnValue(false);
      const mutate = () =>
        operation === 'moveFile'
          ? service.moveFile(PROJECT.id, fileId, {})
          : service.trashFile(PROJECT.id, fileId);

      await expect(mutate()).rejects.toThrow(ServiceUnavailableException);
      googleDriveService.isConfigured.mockReturnValue(true);
      projectService.getById.mockResolvedValue(PROJECT);
      await expect(mutate()).rejects.toThrow(ConflictException);

      expect(googleDriveService.moveFile).not.toHaveBeenCalled();
      expect(googleDriveService.trashFile).not.toHaveBeenCalled();
    },
  );

  it.each(['moveFile', 'trashFile'] as const)(
    'reports %s provider failures as a bad gateway',
    async (operation) => {
      const { service, googleDriveService } = await createFileService();
      googleDriveService[operation].mockRejectedValue(
        new Error('Drive unavailable'),
      );
      const mutation =
        operation === 'moveFile'
          ? service.moveFile(PROJECT.id, fileId, {})
          : service.trashFile(PROJECT.id, fileId);

      await expect(mutation).rejects.toThrow(BadGatewayException);
    },
  );

  it.each(['moveFile', 'trashFile'] as const)(
    'rejects %s when the linked project root is trashed',
    async (operation) => {
      const { service, googleDriveService } = await createFileService();
      const defaultMetadata =
        googleDriveService.getFileMetadata.getMockImplementation()!;
      googleDriveService.getFileMetadata.mockImplementation(
        async (id: string) =>
          id === PROJECT_FOLDER_ID
            ? {
                id,
                parents: [],
                trashed: true,
                mimeType: GOOGLE_DRIVE.FOLDER_MIME_TYPE,
              }
            : defaultMetadata(id),
      );
      const mutation =
        operation === 'moveFile'
          ? service.moveFile(PROJECT.id, fileId, {})
          : service.trashFile(PROJECT.id, fileId);

      await expect(mutation).rejects.toThrow(NotFoundException);
      expect(googleDriveService.moveFile).not.toHaveBeenCalled();
      expect(googleDriveService.trashFile).not.toHaveBeenCalled();
    },
  );

  it('rejects a source whose parent is unavailable or trashed', async () => {
    const { service, googleDriveService } = await createFileService();
    googleDriveService.findParentIds.mockResolvedValue(null);

    await expect(service.trashFile(PROJECT.id, fileId)).rejects.toThrow(
      BadRequestException,
    );
    expect(googleDriveService.trashFile).not.toHaveBeenCalled();
  });
});
