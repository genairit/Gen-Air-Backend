import request from 'supertest';
import { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import { AuthGuard } from '@Guards/auth.guard';
import { ProjectService } from './project.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ProjectRepository } from './project.repository';
import { ProjectController } from './project.controller';
import { AuthService } from '@Modules/auth/auth.service';
import { APP_GUARD, HttpAdapterHost } from '@nestjs/core';
import { USER_ROLES } from '@Constants/user-role.constant';
import { ProjectIntakeService } from './project-intake.service';
import { GeneralFilter } from '../../filters/http-error.filter';
import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { CustomerService } from '@Modules/customer/customer.service';
import { ProjectApartmentService } from './project-apartment.service';
import { HTTP_ERROR_CODES } from '@Constants/http-error-code.constant';
import { PROJECT_STATUS_IDS } from '@Constants/project-status.constant';
import { baselinePermissions } from '../../testing/authorization.fixture';
import { HTTP_ERROR_MESSAGES } from '@Constants/http-error-message.constant';
import { ProjectTypeService } from '@Modules/project-type/project-type.service';
import { ProjectStageService } from '@Modules/project-stage/project-stage.service';
import { ProjectMemberService } from '@Modules/project-member/project-member.service';
import { ProjectTaskInitializationService } from './project-task-initialization.service';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import { ProjectStageTransitionService } from '@Modules/project-stage-transition/project-stage-transition.service';

const PROJECT_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const WAITING_STAGE_ID = PROJECT_STATUS_IDS.WAITING_FOR_RESPONSE;
const ENDPOINTS = {
  MOVE: `/project/${PROJECT_ID}/stage`,
  UPDATE: `/project/${PROJECT_ID}`,
} as const;

describe('waiting-for-response reason API', () => {
  const state: { app: INestApplication<Server> | null } = { app: null };
  const stored: { stageId: string } = {
    stageId: PROJECT_STATUS_IDS.IN_PROGRESS,
  };
  const projectRepository = {
    findById: jest.fn(() =>
      Promise.resolve({ id: PROJECT_ID, stageId: stored.stageId }),
    ),
    update: jest.fn((_id: string, changes: { stageId?: string }) => {
      stored.stageId = changes.stageId ?? stored.stageId;

      return Promise.resolve(true);
    }),
  };
  const transitionService = {
    record: jest.fn().mockResolvedValue(null),
    findLatestNotesByTargetStages: jest.fn(
      ({ projectIds }: { projectIds: string[] }) =>
        Promise.resolve(
          new Map(projectIds.map((id) => [id, 'ממתינים לאישור הלקוח'])),
        ),
    ),
  };
  const server = () => state.app!.getHttpServer();
  const patchAsAdmin = (endpoint: string, body: object) =>
    request(server())
      .patch(endpoint)
      .auth(USER_ROLES.SYSTEM_ADMIN, { type: 'bearer' })
      .send(body);
  const moveAsAdmin = (body: object) => patchAsAdmin(ENDPOINTS.MOVE, body);

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ProjectController],
      providers: [
        ProjectService,
        { provide: ProjectRepository, useValue: projectRepository },
        {
          provide: ProjectApartmentService,
          useValue: { resolveForRead: (project: object) => project },
        },
        {
          provide: ProjectStageService,
          useValue: {
            getById: (id: string) => Promise.resolve({ id }),
          },
        },
        {
          provide: ProjectStageTransitionService,
          useValue: transitionService,
        },
        {
          provide: DatabaseTransactionService,
          useValue: {
            run: (work: (transaction: object) => Promise<unknown>) => work({}),
          },
        },
        { provide: EventEmitter2, useValue: {} },
        { provide: CustomerService, useValue: {} },
        {
          provide: ProjectTypeService,
          useValue: {
            getById: (id: string) =>
              Promise.resolve({ id, canHaveApartments: false }),
          },
        },
        {
          provide: ProjectIntakeService,
          useValue: { resolveChanges: () => Promise.resolve({}) },
        },
        { provide: ProjectMemberService, useValue: {} },
        { provide: ProjectTaskInitializationService, useValue: {} },
        { provide: APP_GUARD, useClass: AuthGuard },
        {
          provide: AuthService,
          useValue: {
            authenticate: (role: string) =>
              Promise.resolve({
                role,
                id: USER_ID,
                permissions: baselinePermissions(role),
              }),
          },
        },
      ],
    }).compile();
    state.app = module.createNestApplication<INestApplication<Server>>();
    state.app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    state.app.useGlobalFilters(
      new GeneralFilter(state.app.get(HttpAdapterHost)),
    );
    await state.app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    stored.stageId = PROJECT_STATUS_IDS.IN_PROGRESS;
  });

  afterAll(async () => state.app?.close());

  it.each([{}, { note: '' }, { note: '   \t ' }])(
    'answers 400 with the reason-required code for %p',
    async (reason) => {
      const response = await moveAsAdmin({
        stageId: WAITING_STAGE_ID,
        ...reason,
      }).expect(400);

      expect(response.body).toEqual({
        statusCode: 400,
        code: HTTP_ERROR_CODES.WAITING_REASON_REQUIRED,
        message: HTTP_ERROR_MESSAGES[HTTP_ERROR_CODES.WAITING_REASON_REQUIRED],
      });
      expect(projectRepository.update).not.toHaveBeenCalled();
      expect(transitionService.record).not.toHaveBeenCalled();
    },
  );

  it('rejects a reason longer than the stored column through validation', async () => {
    const response = await moveAsAdmin({
      stageId: WAITING_STAGE_ID,
      note: 'א'.repeat(FIELD_LENGTHS.TRANSITION_NOTE + 1),
    }).expect(400);

    expect(response.body).toEqual({
      statusCode: 400,
      message: [
        `note must be shorter than or equal to ${FIELD_LENGTHS.TRANSITION_NOTE} characters`,
      ],
    });
    expect(projectRepository.update).not.toHaveBeenCalled();
  });

  it('accepts a reason that fits the column once trimmed', async () => {
    const longestReason = 'א'.repeat(FIELD_LENGTHS.TRANSITION_NOTE);

    await moveAsAdmin({
      stageId: WAITING_STAGE_ID,
      note: `  ${longestReason}  `,
    }).expect(200);

    expect(transitionService.record).toHaveBeenCalledWith(
      expect.objectContaining({ note: longestReason }),
      {},
    );
  });

  it('moves to waiting with the trimmed reason and returns it', async () => {
    const response = await moveAsAdmin({
      stageId: WAITING_STAGE_ID,
      note: '  ממתינים לאישור הלקוח  ',
    }).expect(200);

    expect(transitionService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        toStageId: WAITING_STAGE_ID,
        note: 'ממתינים לאישור הלקוח',
      }),
      {},
    );
    expect(response.body).toMatchObject({
      stageId: WAITING_STAGE_ID,
      waitingReason: 'ממתינים לאישור הלקוח',
    });
  });

  it('moves to another status without a note and returns no reason', async () => {
    const response = await moveAsAdmin({
      stageId: PROJECT_STATUS_IDS.COMPLETED,
    }).expect(200);

    expect(transitionService.record).toHaveBeenCalledWith(
      expect.objectContaining({ note: null }),
      {},
    );
    expect(response.body).toMatchObject({
      stageId: PROJECT_STATUS_IDS.COMPLETED,
      waitingReason: null,
    });
  });

  it.each([{}, { stageNote: '' }, { stageNote: '  ' }])(
    'answers 400 when a generic update moves into waiting with %p',
    async (reason) => {
      const response = await patchAsAdmin(ENDPOINTS.UPDATE, {
        stageId: WAITING_STAGE_ID,
        ...reason,
      }).expect(400);

      expect(response.body).toMatchObject({
        code: HTTP_ERROR_CODES.WAITING_REASON_REQUIRED,
      });
      expect(transitionService.record).not.toHaveBeenCalled();
    },
  );

  it('rejects a generic-update stageNote longer than the stored column through validation', async () => {
    const response = await patchAsAdmin(ENDPOINTS.UPDATE, {
      stageId: WAITING_STAGE_ID,
      stageNote: 'א'.repeat(FIELD_LENGTHS.TRANSITION_NOTE + 1),
    }).expect(400);

    expect(response.body).toEqual({
      statusCode: 400,
      message: [
        `stageNote must be shorter than or equal to ${FIELD_LENGTHS.TRANSITION_NOTE} characters`,
      ],
    });
    expect(transitionService.record).not.toHaveBeenCalled();
  });

  it('updates into waiting with the trimmed stageNote and returns it', async () => {
    const response = await patchAsAdmin(ENDPOINTS.UPDATE, {
      stageId: WAITING_STAGE_ID,
      stageNote: '  ממתינים לאישור הלקוח  ',
    }).expect(200);

    expect(transitionService.record).toHaveBeenCalledWith(
      expect.objectContaining({ note: 'ממתינים לאישור הלקוח' }),
      {},
    );
    expect(response.body).toMatchObject({
      stageId: WAITING_STAGE_ID,
      waitingReason: 'ממתינים לאישור הלקוח',
    });
  });
});
