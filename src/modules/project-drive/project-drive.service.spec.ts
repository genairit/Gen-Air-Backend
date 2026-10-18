import {
  ConflictException,
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
import { ProjectService } from '@Modules/project/project.service';
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
  };
  const googleDriveService = {
    isConfigured: jest.fn().mockReturnValue(true),
    getProjectsRootFolderId: jest.fn().mockReturnValue(ROOT_ID),
    ensureFolder: jest.fn((name: string) => Promise.resolve(`id:${name}`)),
    findParentIds: jest.fn().mockResolvedValue([]),
    listChildren: jest.fn().mockResolvedValue([]),
    countDescendantFiles: jest.fn().mockResolvedValue(new Map()),
    uploadFile: jest.fn().mockResolvedValue({ id: 'uploaded' }),
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      ProjectDriveService,
      { provide: ProjectService, useValue: projectService },
      { provide: GoogleDriveService, useValue: googleDriveService },
      {
        provide: DriveTemplateFolderService,
        useValue: { getTree: jest.fn().mockResolvedValue(TEMPLATE_TREE) },
      },
    ],
  }).compile();

  return {
    service: moduleRef.get(ProjectDriveService),
    projectService,
    googleDriveService,
  };
};

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
  it('creates the project folder, saves it, and copies the template tree with tags filled in', async () => {
    const { service, projectService, googleDriveService } =
      await createService();

    await service.provision(PROJECT.id);

    expect(googleDriveService.ensureFolder).toHaveBeenCalledWith(
      'אכ-48213_מגדל בבלי',
      ROOT_ID,
    );
    expect(projectService.setDriveFolderId).toHaveBeenCalledWith(
      PROJECT.id,
      'id:אכ-48213_מגדל בבלי',
    );
    expect(googleDriveService.ensureFolder).toHaveBeenCalledWith(
      '01_אכ-48213',
      'id:אכ-48213_מגדל בבלי',
    );
    expect(googleDriveService.ensureFolder).toHaveBeenCalledWith(
      'CAD',
      'id:01_אכ-48213',
    );
  });

  it('reuses an existing project folder when retried', async () => {
    const { service, projectService, googleDriveService } =
      await createService();
    projectService.getById.mockResolvedValue({
      ...PROJECT,
      driveFolderId: PROJECT_FOLDER_ID,
    });

    await service.provision(PROJECT.id);

    expect(projectService.setDriveFolderId).not.toHaveBeenCalled();
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
    const { service } = await createService();

    await expect(service.getContents(PROJECT.id, {})).rejects.toThrow(
      ConflictException,
    );
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
