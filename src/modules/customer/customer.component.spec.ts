import request from 'supertest';
import { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { mock } from 'jest-mock-extended';
import { AuthGuard } from '@Guards/auth.guard';
import { CustomerService } from './customer.service';
import { Customer } from './entities/customer.entity';
import { AuthService } from '@Modules/auth/auth.service';
import { CustomerController } from './customer.controller';
import { CustomerRepository } from './customer.repository';
import { USER_ROLES } from '@Constants/user-role.constant';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { baselinePermissions } from '../../testing/authorization.fixture';
import { CustomerProjectLinkService } from './customer-project-link.service';
import { PRIORITY_SYNC_STATUSES } from './constants/priority-sync-status.constant';
import { PROJECT_DETAIL_FIELD_SETS } from '@Constants/project-detail-field-set.constant';
import { createCustomerDependencyFixtures } from '@Modules/customer-contact/testing/customer-dependencies.fixture';

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
  const dependencies = createCustomerDependencyFixtures();
  const application: { app: INestApplication<Server> | null } = { app: null };
  const customerRepository = {
    create: jest.fn().mockResolvedValue(STORED_CUSTOMER),
    update: jest.fn().mockResolvedValue(true),
    findByTaxId: jest.fn().mockResolvedValue(null),
    findById: jest.fn().mockResolvedValue(STORED_CUSTOMER),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CustomerController],
      providers: [
        CustomerService,
        { provide: CustomerProjectLinkService, useValue: {} },
        ...dependencies.providers,
        { provide: CustomerRepository, useValue: customerRepository },
        { provide: APP_GUARD, useClass: AuthGuard },
        {
          provide: AuthService,
          useValue: {
            authenticate: (role: string) =>
              Promise.resolve({
                role,
                id: 'trusted-user',
                permissions:
                  role === 'own-details-editor'
                    ? [PERMISSIONS.CUSTOMERS_READ, PERMISSIONS.CUSTOMERS_UPDATE]
                    : baselinePermissions(role),
              }),
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
  afterEach(() => jest.restoreAllMocks());

  it('rejects anonymous creation', async () => {
    await request(application.app!.getHttpServer())
      .post('/customer')
      .send(CUSTOMER_INPUT)
      .expect(401);
    expect(customerRepository.create).not.toHaveBeenCalled();
  });

  it.each([
    USER_ROLES.FINANCE,
    USER_ROLES.ENGINEER,
    USER_ROLES.INSTALLER,
    USER_ROLES.SECRETARY,
    USER_ROLES.PROJECT_MANAGER,
  ])('rejects %s before writing', async (role) => {
    await request(application.app!.getHttpServer())
      .post('/customer')
      .auth(role, { type: 'bearer' })
      .send(CUSTOMER_INPUT)
      .expect(403);
    expect(customerRepository.create).not.toHaveBeenCalled();
  });

  it.each([USER_ROLES.SYSTEM_ADMIN])(
    'allows %s to create a CRM customer using the authenticated identity',
    async (role) => {
      const response = await request(application.app!.getHttpServer())
        .post('/customer')
        .auth(role, { type: 'bearer' })
        .send({ ...CUSTOMER_INPUT, name: `  ${CUSTOMER_INPUT.name}  ` })
        .expect(201);
      expect(response.body).toEqual(STORED_CUSTOMER);
      expect(customerRepository.create).toHaveBeenCalledWith(
        {
          ...CUSTOMER_INPUT,
          contactName: null,
          phone: null,
          email: null,
          paymentTerms: null,
          paymentSchedule: [],
          createdById: 'trusted-user',
        },
        dependencies.transaction,
      );
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
  it.each([
    { phone: null, email: 'customer@example.com' },
    { phone: '+442071838750', email: null },
    { phone: null, email: null },
  ])(
    'accepts optional own details without a separate contact name: %j',
    async (details) => {
      await request(application.app!.getHttpServer())
        .post('/customer')
        .auth(USER_ROLES.SYSTEM_ADMIN, { type: 'bearer' })
        .send({ ...CUSTOMER_INPUT, contactName: null, ...details })
        .expect(201);
      expect(dependencies.ownContact.setDetails).toHaveBeenCalledWith(
        STORED_CUSTOMER,
        details,
        dependencies.transaction,
      );
    },
  );

  it('permits own-details editing with only customer permissions and supports explicit null clearing', async () => {
    const customer = mock<Customer>({ ...STORED_CUSTOMER });
    customer.update.mockResolvedValue(customer);
    jest.spyOn(Customer, 'findByPk').mockResolvedValue(customer);
    await request(application.app!.getHttpServer())
      .patch('/customer/11111111-1111-4111-8111-111111111111')
      .auth('own-details-editor', { type: 'bearer' })
      .send({ phone: '+442071838750', email: null })
      .expect(200);
    expect(dependencies.ownContact.setDetails).toHaveBeenCalledWith(
      customer,
      { phone: '+442071838750', email: null },
      dependencies.transaction,
    );
  });

  it.each([{ email: 'invalid' }, { phone: '123' }])(
    'rejects invalid own details before any customer mutation: %j',
    async (changes) => {
      await request(application.app!.getHttpServer())
        .patch('/customer/11111111-1111-4111-8111-111111111111')
        .auth('own-details-editor', { type: 'bearer' })
        .send(changes)
        .expect(400);
      expect(dependencies.ownContact.setDetails).not.toHaveBeenCalled();
    },
  );

  it('rejects an engineering account without customer-update permission', async () => {
    await request(application.app!.getHttpServer())
      .patch('/customer/11111111-1111-4111-8111-111111111111')
      .auth(USER_ROLES.ENGINEER, { type: 'bearer' })
      .send({ email: 'new@example.com' })
      .expect(403);
    expect(dependencies.ownContact.setDetails).not.toHaveBeenCalled();
  });
});
