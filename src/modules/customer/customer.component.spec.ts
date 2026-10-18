import request from 'supertest';
import { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from '@Guards/auth.guard';
import { CustomerService } from './customer.service';
import { AuthService } from '@Modules/auth/auth.service';
import { CustomerController } from './customer.controller';
import { CustomerRepository } from './customer.repository';
import { USER_ROLES } from '@Constants/user-role.constant';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { PRIORITY_SYNC_STATUSES } from './constants/priority-sync-status.constant';
import { PROJECT_DETAIL_FIELD_SETS } from '@Constants/project-detail-field-set.constant';

const CUSTOMER_INPUT = {
  taxId: '514287937',
  name: 'לקוח לבדיקה',
  phone: '03-1234567',
  email: 'office@example.com',
  address: 'הרצל 12 תל אביב',
  contactName: 'ישראל ישראלי',
  customerType: PROJECT_DETAIL_FIELD_SETS.COMPANY,
};
const STORED_CUSTOMER = {
  ...CUSTOMER_INPUT,
  id: 'customer-fixture',
  priorityId: null,
  createdById: 'trusted-user',
  prioritySyncStatus: PRIORITY_SYNC_STATUSES.PENDING,
};

describe('CRM-only customer creation API', () => {
  const application: { app: INestApplication<Server> | null } = { app: null };
  const customerRepository = {
    create: jest.fn().mockResolvedValue(STORED_CUSTOMER),
    findByTaxId: jest.fn().mockResolvedValue(null),
    findById: jest.fn().mockResolvedValue(STORED_CUSTOMER),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CustomerController],
      providers: [
        CustomerService,
        { provide: CustomerRepository, useValue: customerRepository },
        { provide: APP_GUARD, useClass: AuthGuard },
        {
          provide: AuthService,
          useValue: {
            authenticate: (role: string) =>
              Promise.resolve({ role, id: 'trusted-user' }),
          },
        },
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
  beforeEach(() => jest.clearAllMocks());
  afterAll(async () => application.app?.close());

  it('rejects anonymous creation', async () => {
    await request(application.app!.getHttpServer())
      .post('/customer')
      .send(CUSTOMER_INPUT)
      .expect(401);
    expect(customerRepository.create).not.toHaveBeenCalled();
  });

  it.each([USER_ROLES.LEAD_INSTALLER, USER_ROLES.SECRETARY])(
    'rejects %s before writing',
    async (role) => {
      await request(application.app!.getHttpServer())
        .post('/customer')
        .auth(role, { type: 'bearer' })
        .send(CUSTOMER_INPUT)
        .expect(403);
      expect(customerRepository.create).not.toHaveBeenCalled();
    },
  );

  it.each([USER_ROLES.SYSTEM_ADMIN, USER_ROLES.PROJECT_MANAGER])(
    'allows %s to create a CRM customer using the authenticated identity',
    async (role) => {
      const response = await request(application.app!.getHttpServer())
        .post('/customer')
        .auth(role, { type: 'bearer' })
        .send({ ...CUSTOMER_INPUT, name: `  ${CUSTOMER_INPUT.name}  ` })
        .expect(201);
      expect(response.body).toEqual(STORED_CUSTOMER);
      expect(customerRepository.create).toHaveBeenCalledWith({
        ...CUSTOMER_INPUT,
        createdById: 'trusted-user',
      });
    },
  );

  it.each([
    'createdById',
    'priorityId',
    'prioritySyncStatus',
    'prioritySyncAttempts',
    'prioritySyncedAt',
    'prioritySyncError',
  ])('rejects spoofed %s', async (field) => {
    await request(application.app!.getHttpServer())
      .post('/customer')
      .auth(USER_ROLES.SYSTEM_ADMIN, { type: 'bearer' })
      .send({ ...CUSTOMER_INPUT, [field]: 'spoofed' })
      .expect(400);
    expect(customerRepository.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid registration number through the production validation pipe', async () => {
    await request(application.app!.getHttpServer())
      .post('/customer')
      .auth(USER_ROLES.SYSTEM_ADMIN, { type: 'bearer' })
      .send({ ...CUSTOMER_INPUT, taxId: '514287938' })
      .expect(400);
    expect(customerRepository.create).not.toHaveBeenCalled();
  });
});
