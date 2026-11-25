import {
  makeCustomerProjectUser,
  CUSTOMER_PROJECT_TEST_IDS,
  makeCustomerProjectParent,
} from '../../../../testing/customer-project.fixture';

import { Test } from '@nestjs/testing';
import { USER_ROLES } from '@Constants/user-role.constant';
import { QuotationJennyTool } from './tools/quotation.tool';
import { ProjectService } from '@Modules/project/project.service';
import { IDriveTreeFile } from '@Interfaces/google-drive.interface';
import { ProjectStatusJennyTool } from './tools/project-status.tool';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PROJECT_STATUS_IDS } from '@Constants/project-status.constant';
import { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import { QuotationService } from '@Modules/quotation/quotation.service';
import { ProjectDocumentsJennyTool } from './tools/project-documents.tool';
import { ProjectJennyContextService } from './project-jenny-context.service';
import { TProjectRead } from '@Modules/project/interfaces/project.interface';
import { JENNY_LIMITS, JENNY_TOOL_NAMES } from '../../constants/jenny.constant';
import { PERMISSIONS, PermissionType } from '@Constants/authorization.constant';
import { ProjectDriveService } from '@Modules/project-drive/project-drive.service';
import { ProjectDocumentSearchJennyTool } from './tools/project-document-search.tool';
import { ProjectDocumentService } from '@Modules/project-document/project-document.service';
import { IProjectDocumentSearch } from '@Modules/project-document/interfaces/project-document.interface';

const CONTEXT_PROJECT_ID = '00000000-0000-4000-8000-0000000000c1';
const OTHER_PROJECT_ID = '00000000-0000-4000-8000-0000000000c2';

const userWith = (...permissions: PermissionType[]): IAuthorizedUser => ({
  ...makeCustomerProjectUser(),
  permissions,
});

const contextProject = (): TProjectRead => ({
  ...makeCustomerProjectParent({
    name: 'מגדלי הים',
    id: CONTEXT_PROJECT_ID,
    stage: {
      tag: null,
      color: null,
      position: 2,
      name: 'מחכה לתשובה',
      deletedAt: null,
      description: null,
      id: PROJECT_STATUS_IDS.WAITING_FOR_RESPONSE,
      createdAt: new Date('2026-10-01T10:00:00.000Z'),
      updatedAt: new Date('2026-10-01T10:00:00.000Z'),
    },
    members: [
      {
        id: 'member-1',
        role: USER_ROLES.ENGINEER,
        projectId: CONTEXT_PROJECT_ID,
        user: makeCustomerProjectUser(),
        userId: CUSTOMER_PROJECT_TEST_IDS.MEMBER,
        createdAt: new Date('2026-10-01T10:00:00.000Z'),
        updatedAt: new Date('2026-10-01T10:00:00.000Z'),
      },
    ],
  }),
  waitingReason: 'ממתינים לאישור הלקוח',
});

describe('ProjectJennyContextService scoping', () => {
  const projectService = {
    getById: jest.fn<Promise<TProjectRead>, [string]>(),
  };
  const quotationService = {
    listByProject: jest.fn<
      ReturnType<QuotationService['listByProject']>,
      Parameters<QuotationService['listByProject']>
    >(),
  };
  const projectDriveService = {
    listProjectFiles: jest.fn<Promise<IDriveTreeFile[]>, [string]>(),
  };
  const projectDocumentService = {
    search: jest.fn<
      Promise<IProjectDocumentSearch>,
      Parameters<ProjectDocumentService['search']>
    >(),
  };
  const state: { context: ProjectJennyContextService | null } = {
    context: null,
  };
  const context = () => state.context!;
  const allPermissions = userWith(
    PERMISSIONS.PROJECTS_READ,
    PERMISSIONS.QUOTATIONS_READ,
    PERMISSIONS.DRIVE_READ,
  );

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ProjectJennyContextService,
        ProjectStatusJennyTool,
        QuotationJennyTool,
        ProjectDocumentsJennyTool,
        ProjectDocumentSearchJennyTool,
        { provide: ProjectService, useValue: projectService },
        { provide: QuotationService, useValue: quotationService },
        { provide: ProjectDriveService, useValue: projectDriveService },
        { provide: ProjectDocumentService, useValue: projectDocumentService },
      ],
    }).compile();
    state.context = module.get(ProjectJennyContextService);
  });

  beforeEach(() => {
    jest.resetAllMocks();
    projectService.getById.mockResolvedValue(contextProject());
    projectDriveService.listProjectFiles.mockResolvedValue([]);
    quotationService.listByProject.mockResolvedValue({
      total: 0,
      items: [],
      nextCursor: null,
    });
    projectDocumentService.search.mockResolvedValue({
      hits: [],
      skipped: [],
      pendingFiles: 0,
    });
  });

  it('rejects users without project read permission before loading the project', async () => {
    await expect(
      context().resolve({
        id: CONTEXT_PROJECT_ID,
        user: userWith(PERMISSIONS.QUOTATIONS_READ, PERMISSIONS.DRIVE_READ),
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(projectService.getById).not.toHaveBeenCalled();
  });

  it('rejects a project the user cannot load under the existing project rules', async () => {
    projectService.getById.mockRejectedValue(
      new NotFoundException(`Project ${OTHER_PROJECT_ID} was not found`),
    );

    await expect(
      context().resolve({ id: OTHER_PROJECT_ID, user: allPermissions }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('offers every project tool to a user holding all of their permissions', async () => {
    const resolved = await context().resolve({
      id: CONTEXT_PROJECT_ID,
      user: allPermissions,
    });

    expect(resolved.prompt).toContain('מגדלי הים');
    expect(resolved.tools.map((tool) => tool.definition.name)).toEqual([
      JENNY_TOOL_NAMES.GET_PROJECT_STATUS,
      JENNY_TOOL_NAMES.GET_QUOTATION,
      JENNY_TOOL_NAMES.LIST_PROJECT_DOCUMENTS,
      JENNY_TOOL_NAMES.SEARCH_PROJECT_DOCUMENTS,
    ]);
  });

  it.each([
    [
      'quotation read',
      [PERMISSIONS.PROJECTS_READ, PERMISSIONS.DRIVE_READ],
      [
        JENNY_TOOL_NAMES.GET_PROJECT_STATUS,
        JENNY_TOOL_NAMES.LIST_PROJECT_DOCUMENTS,
        JENNY_TOOL_NAMES.SEARCH_PROJECT_DOCUMENTS,
      ],
    ],
    [
      'drive read',
      [PERMISSIONS.PROJECTS_READ, PERMISSIONS.QUOTATIONS_READ],
      [JENNY_TOOL_NAMES.GET_PROJECT_STATUS, JENNY_TOOL_NAMES.GET_QUOTATION],
    ],
  ])(
    'filters out tools that need %s',
    async (_missing, permissions, expectedTools) => {
      const resolved = await context().resolve({
        id: CONTEXT_PROJECT_ID,
        user: userWith(...permissions),
      });

      expect(resolved.tools.map((tool) => tool.definition.name)).toEqual(
        expectedTools,
      );
    },
  );

  it('summarizes the project status from the existing project read model', async () => {
    const resolved = await context().resolve({
      id: CONTEXT_PROJECT_ID,
      user: allPermissions,
    });
    const statusTool = resolved.tools.find(
      (tool) => tool.definition.name === JENNY_TOOL_NAMES.GET_PROJECT_STATUS,
    );

    const result = await statusTool?.run({});

    expect(result?.sources).toEqual([]);
    expect(result?.data).toMatchObject({
      code: 'BLDG-1',
      name: 'מגדלי הים',
      stage: 'מחכה לתשובה',
      waitingReason: 'ממתינים לאישור הלקוח',
      team: [{ role: USER_ROLES.ENGINEER, name: 'אורי כהן' }],
    });
  });

  it('never exposes a project id parameter to the model', async () => {
    const resolved = await context().resolve({
      id: CONTEXT_PROJECT_ID,
      user: allPermissions,
    });

    expect(
      JSON.stringify(resolved.tools.map((tool) => tool.definition)),
    ).not.toMatch(/project_?id/i);
  });

  it('runs every tool against the validated context project even if the model supplies another id', async () => {
    const resolved = await context().resolve({
      id: CONTEXT_PROJECT_ID,
      user: allPermissions,
    });
    projectService.getById.mockClear();
    const injectedArguments = {
      query: 'מעבה',
      projectId: OTHER_PROJECT_ID,
      project_id: OTHER_PROJECT_ID,
    };

    await Promise.all(
      resolved.tools.map((tool) => tool.run(injectedArguments)),
    );

    expect(projectService.getById).toHaveBeenCalledWith(CONTEXT_PROJECT_ID);
    expect(quotationService.listByProject).toHaveBeenCalledWith(
      CONTEXT_PROJECT_ID,
      { batchSize: JENNY_LIMITS.MAX_QUOTATIONS },
    );
    expect(projectDriveService.listProjectFiles).toHaveBeenCalledWith(
      CONTEXT_PROJECT_ID,
    );
    expect(projectDocumentService.search).toHaveBeenCalledWith({
      query: 'מעבה',
      projectId: CONTEXT_PROJECT_ID,
    });
  });
});
