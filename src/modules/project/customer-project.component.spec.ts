import {
  ValidationPipe,
  INestApplication,
  NotFoundException,
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
import { AuthService } from '@Modules/auth/auth.service';
import { USER_ROLES } from '@Constants/user-role.constant';
import { CustomerProjectService } from './customer-project.service';
import { CustomerService } from '@Modules/customer/customer.service';
import { BEARER_PREFIX } from '@Modules/auth/constants/auth.constant';
import { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import { CustomerProjectController } from './customer-project.controller';
import { CustomerProjectRepository } from './customer-project.repository';
import { PERMISSIONS, PermissionType } from '@Constants/authorization.constant';
import { encodeCustomerProjectCursor } from './utilities/customer-project-cursor.utility';

const actor = (permissions: PermissionType[]): IAuthorizedUser => ({
  ...makeCustomerProjectUser(),
  permissions,
});
const actors: Record<string, IAuthorizedUser> = {
  granted: actor([PERMISSIONS.CUSTOMERS_READ, PERMISSIONS.PROJECTS_READ]),
  customerOnly: actor([PERMISSIONS.CUSTOMERS_READ]),
  projectOnly: actor([PERMISSIONS.PROJECTS_READ]),
  adminWithoutGrants: { ...actor([]), role: USER_ROLES.SYSTEM_ADMIN },
};

describe('customer related projects HTTP boundaries', () => {
  const application: { app: INestApplication<Server> | null } = { app: null };
  const customers = {
    getById: jest.fn((id: string) => Promise.resolve({ id })),
  };
  const projects = {
    findPage: jest.fn().mockResolvedValue([]),
    countByStage: jest.fn().mockResolvedValue([]),
    countAll: jest.fn().mockResolvedValue(0),
  };
  const server = () => {
    if (!application.app) {
      throw new Error('test application is not initialized');
    }

    return application.app.getHttpServer();
  };
  const path = `/customer/${CUSTOMER_PROJECT_TEST_IDS.CUSTOMER}/projects`;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CustomerProjectController],
      providers: [
        CustomerProjectService,
        { provide: CustomerService, useValue: customers },
        { provide: CustomerProjectRepository, useValue: projects },
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
    application.app = module.createNestApplication<INestApplication<Server>>();
    application.app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await application.app.init();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    customers.getById.mockImplementation((id: string) =>
      Promise.resolve({ id }),
    );
  });
  afterAll(async () => {
    await application.app?.close();
  });

  it('requires authentication before looking up the customer', async () => {
    await request(server()).get(path).expect(401);
    expect(customers.getById).not.toHaveBeenCalled();
    expect(projects.findPage).not.toHaveBeenCalled();
  });

  it.each(['customerOnly', 'projectOnly', 'adminWithoutGrants'])(
    'requires both feature grants without an admin role bypass: %s',
    async (token) => {
      await request(server())
        .get(path)
        .set('Authorization', `${BEARER_PREFIX}${token}`)
        .expect(403);
      expect(customers.getById).not.toHaveBeenCalled();
      expect(projects.findPage).not.toHaveBeenCalled();
    },
  );

  it('allows the granted read features for an engineer and transforms query size', async () => {
    const response = await request(server())
      .get(path)
      .query({ batchSize: '10', search: '  שם  ' })
      .set('Authorization', `${BEARER_PREFIX}granted`)
      .expect(200);
    expect(response.body).toEqual({
      items: [],
      nextCursor: null,
      total: 0,
      counts: { total: 0, byStage: {} },
    });
    expect(projects.findPage).toHaveBeenCalledWith(
      {
        customerId: CUSTOMER_PROJECT_TEST_IDS.CUSTOMER,
        search: 'שם',
        stageId: null,
      },
      { size: 10, cursor: null },
    );
  });

  it('rejects invalid route IDs before querying customer data', async () => {
    await request(server())
      .get('/customer/not-a-uuid/projects')
      .set('Authorization', `${BEARER_PREFIX}granted`)
      .expect(400);
    expect(customers.getById).not.toHaveBeenCalled();
  });

  it('returns not found for an unknown or archived customer instead of an empty list', async () => {
    customers.getById.mockRejectedValue(
      new NotFoundException('Customer missing'),
    );
    await request(server())
      .get(path)
      .set('Authorization', `${BEARER_PREFIX}granted`)
      .expect(404);
    expect(projects.findPage).not.toHaveBeenCalled();
  });

  it.each([
    { customerId: CUSTOMER_PROJECT_TEST_IDS.OTHER },
    { batchSize: 101 },
    { stageId: 'unknown' },
    { batchCursor: '' },
  ])('rejects unsupported query or boundary violations %p', async (query) => {
    await request(server())
      .get(path)
      .query(query)
      .set('Authorization', `${BEARER_PREFIX}granted`)
      .expect(400);
    expect(projects.findPage).not.toHaveBeenCalled();
  });

  it('rejects a valid cursor copied from another customer, without querying projects', async () => {
    const cursor = encodeCustomerProjectCursor({
      customerId: CUSTOMER_PROJECT_TEST_IDS.OTHER,
      search: '',
      stageId: null,
      id: CUSTOMER_PROJECT_TEST_IDS.PROJECT,
      name: 'שם',
      updatedAt: new Date('2026-10-20'),
    });
    await request(server())
      .get(path)
      .query({ batchCursor: cursor })
      .set('Authorization', `${BEARER_PREFIX}granted`)
      .expect(400);
    expect(projects.findPage).not.toHaveBeenCalled();
  });
});
