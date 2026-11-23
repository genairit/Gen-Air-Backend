import {
  IDriveItem,
  IDriveFileMetadata,
} from '@Interfaces/google-drive.interface';

import { Test } from '@nestjs/testing';
import { mock } from 'jest-mock-extended';
import { GOOGLE_DRIVE } from '@Constants/google-drive.constant';
import { ProjectDriveLinkService } from './project-drive-link.service';
import { ProjectRepository } from '@Modules/project/project.repository';
import { IProject } from '@Modules/project/interfaces/project.interface';
import { GoogleDriveService } from '@Providers/google-drive/google-drive.service';
import { IProjectType } from '@Modules/project-type/interfaces/project-type.interface';
import { DRIVE_FOLDER_LINK_ERROR_CODES } from './constants/drive-folder-link.constant';
import { DriveTemplateFolderService } from '@Modules/drive-template-folder/drive-template-folder.service';

type TMetadataById = Map<string, IDriveFileMetadata>;
type TParentIdsById = Map<string, string[]>;
type TChildrenById = Map<string, IDriveItem[]>;
type TFolderOwner = Pick<IProject, 'id' | 'driveFolderId' | 'parentProjectId'>;

interface ILinkFixtureState {
  building: IProject;
  rootId: string | null;
  owners: TFolderOwner[];
  metadata: TMetadataById;
  parents: TParentIdsById;
  children: TChildrenById;
}

const IDS = {
  ROOT: 'company-root',
  LEGACY: 'legacy-folder',
  BUILDING: 'building-folder',
  BUILDING_PROJECT: 'building-project',
  RESIDENTS: 'residents-folder',
  OWNED: 'owned-project-folder',
} as const;

const folderMetadata = (id: string, parentId: string): IDriveFileMetadata => ({
  id,
  name: id,
  parents: [parentId],
  trashed: false,
  mimeType: GOOGLE_DRIVE.FOLDER_MIME_TYPE,
});

const folderItem = (id: string, name: string): IDriveItem => ({
  id,
  name,
  size: null,
  isFolder: true,
  modifiedTime: null,
  webViewLink: null,
  mimeType: GOOGLE_DRIVE.FOLDER_MIME_TYPE,
});

const createService = async () => {
  const state: ILinkFixtureState = {
    rootId: IDS.ROOT,
    metadata: new Map<string, IDriveFileMetadata>([
      [IDS.LEGACY, folderMetadata(IDS.LEGACY, IDS.ROOT)],
      [IDS.ROOT, folderMetadata(IDS.ROOT, 'shared-drive')],
    ]),
    parents: new Map<string, string[]>([
      [IDS.LEGACY, [IDS.ROOT]],
      [IDS.ROOT, []],
    ]),
    children: new Map<string, IDriveItem[]>(),
    owners: [],
    building: mock<IProject>({
      id: IDS.BUILDING_PROJECT,
      parentProjectId: null,
      driveFolderId: IDS.BUILDING,
    }),
  };
  state.building.projectType = mock<IProjectType>({ canHaveApartments: true });

  const drive = {
    getProjectsRootFolderId: jest.fn(() => state.rootId),
    getFileMetadata: jest.fn((id: string) =>
      Promise.resolve(state.metadata.get(id) ?? null),
    ),
    findParentIds: jest.fn((id: string) =>
      Promise.resolve(state.parents.get(id) ?? []),
    ),
    listChildren: jest.fn((id: string) =>
      Promise.resolve(state.children.get(id) ?? []),
    ),
    ensureFolder: jest.fn(),
    moveFile: jest.fn(),
    trashFile: jest.fn(),
    uploadFile: jest.fn(),
  };
  const projects = {
    findById: jest.fn(() => Promise.resolve(state.building)),
    findDriveFolderOwners: jest.fn(() => Promise.resolve(state.owners)),
  };
  const templates = {
    getTree: jest.fn(() =>
      Promise.resolve([
        { name: 'תוכניות', children: [{ name: 'PDF', children: [] }] },
        { name: 'הצעות מחיר', children: [] },
      ]),
    ),
  };
  const module = await Test.createTestingModule({
    providers: [
      ProjectDriveLinkService,
      { provide: GoogleDriveService, useValue: drive },
      { provide: ProjectRepository, useValue: projects },
      { provide: DriveTemplateFolderService, useValue: templates },
    ],
  }).compile();
  return {
    state,
    drive,
    projects,
    templates,
    service: module.get(ProjectDriveLinkService),
  };
};

describe('existing project Drive folder validation', () => {
  it('previews a company legacy folder and nested missing template paths without Drive writes', async () => {
    const { service, state, drive } = await createService();
    state.children.set(IDS.LEGACY, [folderItem('plans-folder', 'תוכניות')]);
    const result = await service.preview({
      reference: `https://drive.google.com/drive/folders/${IDS.LEGACY}`,
    });
    expect(result).toEqual({
      id: IDS.LEGACY,
      name: IDS.LEGACY,
      missingTemplateFolders: ['תוכניות/PDF', 'הצעות מחיר'],
    });
    expect(drive.ensureFolder).not.toHaveBeenCalled();
    expect(drive.moveFile).not.toHaveBeenCalled();
    expect(drive.trashFile).not.toHaveBeenCalled();
    expect(drive.uploadFile).not.toHaveBeenCalled();
  });

  it('recognizes an existing complete template without changing its contents', async () => {
    const { service, state, drive } = await createService();
    state.children.set(IDS.LEGACY, [
      folderItem('plans', 'תוכניות'),
      folderItem('quotes', 'הצעות מחיר'),
    ]);
    state.children.set('plans', [folderItem('pdf', 'PDF')]);
    await expect(
      service.preview({ reference: IDS.LEGACY }),
    ).resolves.toMatchObject({ missingTemplateFolders: [] });
    expect(drive.ensureFolder).not.toHaveBeenCalled();
  });

  it('rejects an unconfigured root before requesting any Drive metadata', async () => {
    const { service, state, drive } = await createService();
    state.rootId = null;
    await expect(
      service.preview({ reference: IDS.LEGACY }),
    ).rejects.toMatchObject({
      response: { code: DRIVE_FOLDER_LINK_ERROR_CODES.NOT_CONFIGURED },
    });
    expect(drive.getFileMetadata).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', null],
    ['trashed', { ...folderMetadata(IDS.LEGACY, IDS.ROOT), trashed: true }],
  ])('rejects %s folders', async (_name, metadata) => {
    const { service, drive } = await createService();
    drive.getFileMetadata.mockResolvedValueOnce(metadata);
    await expect(
      service.preview({ reference: IDS.LEGACY }),
    ).rejects.toMatchObject({
      response: { code: DRIVE_FOLDER_LINK_ERROR_CODES.NOT_FOUND },
    });
  });

  it.each(['application/pdf', 'application/vnd.google-apps.shortcut'])(
    'rejects %s as a folder reference',
    async (mimeType) => {
      const { service, state } = await createService();
      state.metadata.set(IDS.LEGACY, {
        ...folderMetadata(IDS.LEGACY, IDS.ROOT),
        mimeType,
      });
      await expect(
        service.preview({ reference: IDS.LEGACY }),
      ).rejects.toMatchObject({
        response: { code: DRIVE_FOLDER_LINK_ERROR_CODES.NOT_FOLDER },
      });
    },
  );

  it('rejects the company root itself and folders outside its ancestry', async () => {
    const { service, state } = await createService();
    await expect(
      service.preview({ reference: IDS.ROOT }),
    ).rejects.toMatchObject({
      response: { code: DRIVE_FOLDER_LINK_ERROR_CODES.OUTSIDE_ROOT },
    });
    state.parents.set(IDS.LEGACY, ['outside-folder']);
    await expect(
      service.preview({ reference: IDS.LEGACY }),
    ).rejects.toMatchObject({
      response: { code: DRIVE_FOLDER_LINK_ERROR_CODES.OUTSIDE_ROOT },
    });
  });

  it('bounds cyclic ancestry rather than accepting it as a company folder', async () => {
    const { service, state } = await createService();
    state.parents.set(IDS.LEGACY, [IDS.LEGACY]);
    await expect(
      service.preview({ reference: IDS.LEGACY }),
    ).rejects.toMatchObject({
      response: { code: DRIVE_FOLDER_LINK_ERROR_CODES.OUTSIDE_ROOT },
    });
  });

  it.each([403, 404])(
    'returns a sanitized unavailable-folder error for Drive %s',
    async (code) => {
      const { service, drive } = await createService();
      drive.getFileMetadata.mockRejectedValueOnce({
        code,
        message: 'SDK/private-file-detail',
      });
      await expect(
        service.preview({ reference: IDS.LEGACY }),
      ).rejects.toMatchObject({
        response: { code: DRIVE_FOLDER_LINK_ERROR_CODES.NOT_FOUND },
      });
    },
  );

  it.each([
    [401, DRIVE_FOLDER_LINK_ERROR_CODES.AUTHENTICATION_FAILED],
    [500, DRIVE_FOLDER_LINK_ERROR_CODES.UNAVAILABLE],
  ])(
    'classifies Drive %s errors without exposing SDK messages',
    async (code, expectedCode) => {
      const { service, drive } = await createService();
      drive.getFileMetadata.mockRejectedValueOnce({
        code,
        message: 'SDK/private-file-detail',
      });
      await expect(
        service.preview({ reference: IDS.LEGACY }),
      ).rejects.toMatchObject({ response: { code: expectedCode } });
    },
  );

  it('rejects a folder already assigned to another live project', async () => {
    const { service, state } = await createService();
    state.owners.push({
      parentProjectId: null,
      id: 'other-project',
      driveFolderId: IDS.LEGACY,
    });
    await expect(
      service.preview({ reference: IDS.LEGACY }),
    ).rejects.toMatchObject({
      response: { code: DRIVE_FOLDER_LINK_ERROR_CODES.ALREADY_LINKED },
    });
  });

  it.each(['inside', 'contains'])(
    'rejects a folder that %s another project root',
    async (overlap) => {
      const { service, state } = await createService();
      state.owners.push({
        parentProjectId: null,
        id: 'other-project',
        driveFolderId: IDS.OWNED,
      });
      state.parents.set(
        IDS.OWNED,
        overlap === 'contains' ? [IDS.LEGACY] : [IDS.ROOT],
      );
      state.parents.set(
        IDS.LEGACY,
        overlap === 'inside' ? [IDS.OWNED] : [IDS.ROOT],
      );
      await expect(
        service.preview({ reference: IDS.LEGACY }),
      ).rejects.toMatchObject({
        response: { code: DRIVE_FOLDER_LINK_ERROR_CODES.OVERLAP },
      });
    },
  );

  it('allows inspecting a project’s own persisted folder rather than treating it as foreign ownership', async () => {
    const { service, state } = await createService();
    state.owners.push({
      parentProjectId: null,
      id: 'this-project',
      driveFolderId: IDS.LEGACY,
    });
    await expect(
      service.resolve(IDS.LEGACY, null, 'this-project'),
    ).resolves.toMatchObject({ id: IDS.LEGACY });
  });

  it('inspects a linked building with its own apartment and accepts a second sibling apartment', async () => {
    const { service, state } = await createService();
    state.metadata.set(IDS.BUILDING, folderMetadata(IDS.BUILDING, IDS.ROOT));
    state.parents.set(IDS.BUILDING, [IDS.ROOT]);
    state.parents.set(IDS.RESIDENTS, [IDS.BUILDING]);
    state.parents.set(IDS.OWNED, [IDS.RESIDENTS]);
    state.parents.set(IDS.LEGACY, [IDS.RESIDENTS]);
    state.metadata.set(IDS.LEGACY, folderMetadata(IDS.LEGACY, IDS.RESIDENTS));
    state.children.set(IDS.BUILDING, [folderItem(IDS.RESIDENTS, 'דיירים')]);
    state.owners.push(
      {
        id: IDS.BUILDING_PROJECT,
        driveFolderId: IDS.BUILDING,
        parentProjectId: null,
      },
      {
        id: 'first-apartment',
        driveFolderId: IDS.OWNED,
        parentProjectId: IDS.BUILDING_PROJECT,
      },
    );
    await expect(service.inspect(state.building)).resolves.toEqual(
      expect.any(Array),
    );
    await expect(
      service.preview({
        reference: IDS.LEGACY,
        buildingId: IDS.BUILDING_PROJECT,
      }),
    ).resolves.toMatchObject({ id: IDS.LEGACY });
    state.owners[1].parentProjectId = 'foreign-building';
    await expect(service.inspect(state.building)).rejects.toMatchObject({
      response: { code: DRIVE_FOLDER_LINK_ERROR_CODES.OVERLAP },
    });
  });

  it('rejects duplicate matching template subfolders instead of choosing arbitrarily', async () => {
    const { service, state, drive } = await createService();
    state.children.set(IDS.LEGACY, [
      folderItem('plans-one', 'תוכניות'),
      folderItem('plans-two', 'תוכניות'),
    ]);
    await expect(
      service.preview({ reference: IDS.LEGACY }),
    ).rejects.toMatchObject({
      response: { code: DRIVE_FOLDER_LINK_ERROR_CODES.AMBIGUOUS_TEMPLATE },
    });
    expect(drive.ensureFolder).not.toHaveBeenCalled();
  });

  it('permits an apartment folder under its own building’s unique residents folder', async () => {
    const { service, state, drive } = await createService();
    state.owners.push({
      parentProjectId: null,
      id: IDS.BUILDING_PROJECT,
      driveFolderId: IDS.BUILDING,
    });
    state.parents.set(IDS.LEGACY, [IDS.RESIDENTS]);
    state.parents.set(IDS.RESIDENTS, [IDS.BUILDING]);
    state.parents.set(IDS.BUILDING, [IDS.ROOT]);
    state.metadata.set(IDS.LEGACY, folderMetadata(IDS.LEGACY, IDS.RESIDENTS));
    state.children.set(IDS.BUILDING, [folderItem(IDS.RESIDENTS, 'דיירים')]);
    await expect(
      service.preview({
        reference: IDS.LEGACY,
        buildingId: IDS.BUILDING_PROJECT,
      }),
    ).resolves.toMatchObject({ id: IDS.LEGACY });
    expect(drive.ensureFolder).not.toHaveBeenCalled();
    expect(drive.moveFile).not.toHaveBeenCalled();
  });

  it('rejects missing residents folders and wrong apartment parents without provisioning or moving', async () => {
    const { service, drive } = await createService();
    await expect(
      service.preview({
        reference: IDS.LEGACY,
        buildingId: IDS.BUILDING_PROJECT,
      }),
    ).rejects.toMatchObject({
      response: { code: DRIVE_FOLDER_LINK_ERROR_CODES.APARTMENT_LOCATION },
    });
    expect(drive.ensureFolder).not.toHaveBeenCalled();
    expect(drive.moveFile).not.toHaveBeenCalled();
  });

  it('rejects ambiguous residents containers without mutating them', async () => {
    const { service, state, drive } = await createService();
    state.children.set(IDS.BUILDING, [
      folderItem('residents-one', 'דיירים'),
      folderItem('residents-two', 'דיירים'),
    ]);
    await expect(
      service.preview({
        reference: IDS.LEGACY,
        buildingId: IDS.BUILDING_PROJECT,
      }),
    ).rejects.toMatchObject({
      response: { code: DRIVE_FOLDER_LINK_ERROR_CODES.APARTMENT_LOCATION },
    });
    expect(drive.ensureFolder).not.toHaveBeenCalled();
  });
  it('does not let an apartment reuse another apartment’s nested folder', async () => {
    const { service, state } = await createService();
    state.owners.push(
      {
        parentProjectId: null,
        id: IDS.BUILDING_PROJECT,
        driveFolderId: IDS.BUILDING,
      },
      {
        parentProjectId: IDS.BUILDING_PROJECT,
        id: 'another-apartment',
        driveFolderId: IDS.OWNED,
      },
    );
    state.parents.set(IDS.LEGACY, [IDS.OWNED]);
    state.parents.set(IDS.OWNED, [IDS.RESIDENTS]);
    state.parents.set(IDS.RESIDENTS, [IDS.BUILDING]);
    state.parents.set(IDS.BUILDING, [IDS.ROOT]);
    state.metadata.set(IDS.LEGACY, folderMetadata(IDS.LEGACY, IDS.OWNED));
    state.children.set(IDS.BUILDING, [folderItem(IDS.RESIDENTS, 'דיירים')]);
    await expect(
      service.preview({
        reference: IDS.LEGACY,
        buildingId: IDS.BUILDING_PROJECT,
      }),
    ).rejects.toMatchObject({
      response: { code: DRIVE_FOLDER_LINK_ERROR_CODES.OVERLAP },
    });
  });

  it('reports unavailable or non-building apartment context without changing Drive', async () => {
    const { service, state, drive } = await createService();
    state.building.driveFolderId = null;
    await expect(
      service.preview({
        reference: IDS.LEGACY,
        buildingId: IDS.BUILDING_PROJECT,
      }),
    ).rejects.toMatchObject({
      response: { code: DRIVE_FOLDER_LINK_ERROR_CODES.APARTMENT_LOCATION },
    });
    state.building.driveFolderId = IDS.BUILDING;
    state.building.projectType = mock<IProjectType>({
      canHaveApartments: false,
    });
    await expect(
      service.preview({
        reference: IDS.LEGACY,
        buildingId: IDS.BUILDING_PROJECT,
      }),
    ).rejects.toMatchObject({
      response: { code: DRIVE_FOLDER_LINK_ERROR_CODES.APARTMENT_LOCATION },
    });
    expect(drive.ensureFolder).not.toHaveBeenCalled();
  });

  it('resolves project naming placeholders during persisted template inspection', async () => {
    const { service, state, templates, drive } = await createService();
    templates.getTree.mockResolvedValueOnce([
      { name: '{Project_ID}_{Project_Name}', children: [] },
    ]);
    state.children.set(IDS.LEGACY, [
      folderItem('named-template', 'GA-101_מגדל'),
    ]);
    const project = mock<IProject>({
      id: 'project-id',
      name: 'מגדל',
      code: 'GA-101',
      driveFolderId: IDS.LEGACY,
      parentProjectId: null,
    });
    await expect(service.inspect(project)).resolves.toEqual([]);
    expect(drive.ensureFolder).not.toHaveBeenCalled();
  });
});
