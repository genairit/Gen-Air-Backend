import {
  USER_ROLES,
  UserRoleType,
  USER_ROLE_VALUES,
} from '@Constants/user-role.constant';

import request from 'supertest';
import { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from '@Guards/auth.guard';
import { ProjectService } from './project.service';
import { ProjectController } from './project.controller';
import { AuthService } from '@Modules/auth/auth.service';
import { isUserRole } from '@Utilities/user-role.utility';
import { INestApplication, UnauthorizedException } from '@nestjs/common';

const PROJECT_ID = '00000000-0000-4000-8000-000000000001';
const STAGE_ID = '00000000-0000-4000-8000-000000000002';
const CUSTOMER_ID = '00000000-0000-4000-8000-000000000003';

const PROJECT_EDITORS: UserRoleType[] = [
  USER_ROLES.SECRETARY,
  USER_ROLES.SYSTEM_ADMIN,
  USER_ROLES.PROJECT_MANAGER,
];

const rolesExcept = (allowed: UserRoleType[]): UserRoleType[] =>
  USER_ROLE_VALUES.filter((role) => !allowed.includes(role));

describe('Project HTTP permission boundaries', () => {
  const application: { app: INestApplication<Server> | null } = { app: null };
  const server = () => application.app!.getHttpServer();
  const projectService = {
    create: jest.fn(() => Promise.resolve({ id: PROJECT_ID })),
    createApartment: jest.fn(() => Promise.resolve({ id: PROJECT_ID })),
    move: jest.fn(() => Promise.resolve({ id: PROJECT_ID })),
    update: jest.fn(() => Promise.resolve({ id: PROJECT_ID })),
    delete: jest.fn(() => Promise.resolve()),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ProjectController],
      providers: [
        { provide: ProjectService, useValue: projectService },
        {
          provide: AuthService,
          useValue: {
            authenticate: (token: string) => {
              if (!isUserRole(token)) {
                throw new UnauthorizedException();
              }

              return Promise.resolve({ id: token, role: token });
            },
          },
        },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    }).compile();
    application.app = module.createNestApplication<INestApplication<Server>>();
    await application.app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await application.app?.close();
  });

  it('lets only management create projects', async () => {
    await request(server())
      .post('/project')
      .auth(USER_ROLES.SYSTEM_ADMIN, { type: 'bearer' })
      .send({})
      .expect(201);
    expect(projectService.create).toHaveBeenCalledTimes(1);
  });

  it.each(rolesExcept([USER_ROLES.SYSTEM_ADMIN]))(
    'denies %s creating or deleting a project',
    async (role) => {
      await request(server())
        .post('/project')
        .auth(role, { type: 'bearer' })
        .send({})
        .expect(403);
      await request(server())
        .delete(`/project/${PROJECT_ID}`)
        .auth(role, { type: 'bearer' })
        .expect(403);
      expect(projectService.create).not.toHaveBeenCalled();
      expect(projectService.delete).not.toHaveBeenCalled();
    },
  );

  it.each(PROJECT_EDITORS)(
    'lets %s change the project status and details',
    async (role) => {
      await request(server())
        .patch(`/project/${PROJECT_ID}/stage`)
        .auth(role, { type: 'bearer' })
        .send({ stageId: STAGE_ID })
        .expect(200);
      await request(server())
        .patch(`/project/${PROJECT_ID}`)
        .auth(role, { type: 'bearer' })
        .send({})
        .expect(200);
    },
  );

  it.each(rolesExcept(PROJECT_EDITORS))(
    'denies %s changing the project status and details',
    async (role) => {
      await request(server())
        .patch(`/project/${PROJECT_ID}/stage`)
        .auth(role, { type: 'bearer' })
        .send({ stageId: STAGE_ID })
        .expect(403);
      await request(server())
        .patch(`/project/${PROJECT_ID}`)
        .auth(role, { type: 'bearer' })
        .send({})
        .expect(403);
      expect(projectService.move).not.toHaveBeenCalled();
      expect(projectService.update).not.toHaveBeenCalled();
    },
  );

  it.each(PROJECT_EDITORS)(
    'lets %s create apartments and change apartment teams',
    async (role) => {
      await request(server())
        .post(`/project/${PROJECT_ID}/apartments`)
        .auth(role, { type: 'bearer' })
        .send({
          customerFloor: 3,
          customerApartment: '24א',
          customerId: CUSTOMER_ID,
        })
        .expect(201);
      await request(server())
        .patch(`/project/${PROJECT_ID}`)
        .auth(role, { type: 'bearer' })
        .send({ hasOwnTeam: true, members: [] })
        .expect(200);
      expect(projectService.createApartment).toHaveBeenCalledTimes(1);
      expect(projectService.update).toHaveBeenCalledTimes(1);
    },
  );

  it.each(rolesExcept(PROJECT_EDITORS))(
    'denies %s apartment creation and team changes',
    async (role) => {
      await request(server())
        .post(`/project/${PROJECT_ID}/apartments`)
        .auth(role, { type: 'bearer' })
        .send({
          customerFloor: 3,
          customerApartment: '24א',
          customerId: CUSTOMER_ID,
        })
        .expect(403);
      await request(server())
        .patch(`/project/${PROJECT_ID}`)
        .auth(role, { type: 'bearer' })
        .send({ hasOwnTeam: false })
        .expect(403);
      expect(projectService.createApartment).not.toHaveBeenCalled();
      expect(projectService.update).not.toHaveBeenCalled();
    },
  );

  it('requires authentication before apartment creation', async () => {
    await request(server())
      .post(`/project/${PROJECT_ID}/apartments`)
      .send({})
      .expect(401);
    expect(projectService.createApartment).not.toHaveBeenCalled();
  });
});
