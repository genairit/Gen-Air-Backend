import {
  ValidationPipe,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';

import {
  makeCustomerProjectUser,
  CUSTOMER_PROJECT_TEST_IDS,
} from '../../testing/customer-project.fixture';

import request from 'supertest';
import { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from '@Guards/auth.guard';
import { ProjectService } from './project.service';
import { ProjectController } from './project.controller';
import { AuthService } from '@Modules/auth/auth.service';
import { USER_ROLES } from '@Constants/user-role.constant';
import { BEARER_PREFIX } from '@Modules/auth/constants/auth.constant';
import { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import { PERMISSIONS, PermissionType } from '@Constants/authorization.constant';

const actor = (permissions: PermissionType[]): IAuthorizedUser => ({
  ...makeCustomerProjectUser(),
  permissions,
});
const actors: Record<string, IAuthorizedUser> = {
  reader: actor([PERMISSIONS.PROJECTS_READ]),
  createOnly: actor([PERMISSIONS.PROJECTS_CREATE]),
  deniedAdmin: { ...actor([]), role: USER_ROLES.SYSTEM_ADMIN },
};

describe('project name availability HTTP boundary', () => {
  const state: { app: INestApplication<Server> | null } = { app: null };
  const projects = {
    isNameAvailable: jest.fn().mockResolvedValue(true),
    getById: jest.fn(),
  };
  const server = () => {
    if (!state.app) {
      throw new Error('test application was not initialized');
    }

    return state.app.getHttpServer();
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ProjectController],
      providers: [
        { provide: ProjectService, useValue: projects },
        {
          provide: AuthService,
          useValue: {
            authenticate: (token: string) => {
              const user = actors[token] ?? null;
              if (!user) {
                throw new UnauthorizedException();
              }

              return Promise.resolve(user);
            },
          },
        },
        { provide: APP_GUARD, useClass: AuthGuard },
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
    await state.app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    projects.isNameAvailable.mockResolvedValue(true);
  });

  afterAll(async () => {
    await state.app?.close();
  });

  it('requires a valid session before checking any name', async () => {
    await request(server())
      .get('/project/name-availability')
      .query({ name: 'פרויקט' })
      .expect(401);
    expect(projects.isNameAvailable).not.toHaveBeenCalled();
  });

  it.each(['createOnly', 'deniedAdmin'])(
    'requires project read without a role bypass: %s',
    async (token) => {
      await request(server())
        .get('/project/name-availability')
        .query({ name: 'פרויקט' })
        .set('Authorization', `${BEARER_PREFIX}${token}`)
        .expect(403);
      expect(projects.isNameAvailable).not.toHaveBeenCalled();
    },
  );

  it.each([true, false])(
    'returns only availability=%s, with trimmed name and own-record exclusion',
    async (available) => {
      projects.isNameAvailable.mockResolvedValue(available);
      const response = await request(server())
        .get('/project/name-availability')
        .query({
          name: '\u00a0Project  A\u3000',
          excludeId: CUSTOMER_PROJECT_TEST_IDS.PROJECT,
        })
        .set('Authorization', `${BEARER_PREFIX}reader`)
        .expect(200);
      expect(response.body).toEqual({ available });
      expect(projects.isNameAvailable).toHaveBeenCalledWith(
        'Project  A',
        CUSTOMER_PROJECT_TEST_IDS.PROJECT,
      );
      expect(projects.getById).not.toHaveBeenCalled();
    },
  );

  it('omits record exclusion for project creation', async () => {
    await request(server())
      .get('/project/name-availability')
      .query({ name: 'פרויקט' })
      .set('Authorization', `${BEARER_PREFIX}reader`)
      .expect(200);
    expect(projects.isNameAvailable).toHaveBeenCalledWith('פרויקט', null);
  });

  it.each([
    {},
    { name: '\t ' },
    { name: 'פרויקט', excludeId: 'invalid' },
    { name: 'פרויקט', customerId: CUSTOMER_PROJECT_TEST_IDS.CUSTOMER },
  ])('rejects invalid queries without querying data: %p', async (query) => {
    await request(server())
      .get('/project/name-availability')
      .query(query)
      .set('Authorization', `${BEARER_PREFIX}reader`)
      .expect(400);
    expect(projects.isNameAvailable).not.toHaveBeenCalled();
  });
});
