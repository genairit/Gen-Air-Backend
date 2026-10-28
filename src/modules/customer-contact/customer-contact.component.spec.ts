import {
  CONTACT_INPUT,
  STORED_CONTACT,
  CONTACT_TEST_IDS,
} from './testing/customer-contact.fixture';

import request from 'supertest';
import { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from '@Guards/auth.guard';
import { Sequelize, Transaction } from 'sequelize';
import { AuthService } from '@Modules/auth/auth.service';
import { USER_ROLES } from '@Constants/user-role.constant';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { CustomerContactService } from './customer-contact.service';
import { baselinePermissions } from '../../testing/authorization.fixture';
import { CustomerContactController } from './customer-contact.controller';
import { CustomerContactRepository } from './customer-contact.repository';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';

const endpoint = `/customer/${CONTACT_TEST_IDS.CUSTOMER}/contacts`;

describe('customer-owned contacts API', () => {
  const state: { app: INestApplication<Server> | null } = { app: null };
  const transaction = new Transaction(
    new Sequelize({ dialect: 'postgres', logging: false }),
    {},
  );
  const repository = {
    customerExists: jest.fn().mockResolvedValue(true),
    list: jest.fn().mockResolvedValue([STORED_CONTACT]),
    lockCustomer: jest.fn().mockResolvedValue(true),
    findExact: jest.fn().mockResolvedValue(null),
    findById: jest
      .fn()
      .mockResolvedValue({ ...STORED_CONTACT, get: () => STORED_CONTACT }),
    create: jest.fn().mockResolvedValue(STORED_CONTACT),
    update: jest.fn().mockResolvedValue(null),
  };
  const runTransaction = jest.fn(
    (work: (value: Transaction) => Promise<unknown>) => work(transaction),
  );

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CustomerContactController],
      providers: [
        CustomerContactService,
        { provide: CustomerContactRepository, useValue: repository },
        {
          provide: DatabaseTransactionService,
          useValue: { run: runTransaction },
        },
        { provide: APP_GUARD, useClass: AuthGuard },
        {
          provide: AuthService,
          useValue: {
            authenticate: (role: string) =>
              Promise.resolve({
                role,
                id: CONTACT_TEST_IDS.USER,
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
    await state.app.init();
  });
  beforeEach(() => jest.clearAllMocks());
  afterAll(async () => state.app?.close());

  it('requires authentication for reads and writes', async () => {
    await request(state.app!.getHttpServer()).get(endpoint).expect(401);
    await request(state.app!.getHttpServer())
      .post(endpoint)
      .send(CONTACT_INPUT)
      .expect(401);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('returns all contacts for the linked customer without selecting a main contact', async () => {
    const result = await request(state.app!.getHttpServer())
      .get(endpoint)
      .auth(USER_ROLES.SECRETARY, { type: 'bearer' })
      .expect(200);
    expect(result.body).toHaveLength(1);
    expect(repository.list).toHaveBeenCalledWith(CONTACT_TEST_IDS.CUSTOMER);
  });

  it.each([
    USER_ROLES.SECRETARY,
    USER_ROLES.PROJECT_MANAGER,
    USER_ROLES.ENGINEER,
    USER_ROLES.INSTALLER,
    USER_ROLES.FINANCE,
  ])('denies %s writes under existing customer permissions', async (role) => {
    await request(state.app!.getHttpServer())
      .post(endpoint)
      .auth(role, { type: 'bearer' })
      .send(CONTACT_INPUT)
      .expect(403);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects reading contacts for a missing customer', async () => {
    repository.customerExists.mockResolvedValueOnce(false);
    await request(state.app!.getHttpServer())
      .get(endpoint)
      .auth(USER_ROLES.SYSTEM_ADMIN, { type: 'bearer' })
      .expect(404);
    expect(repository.list).not.toHaveBeenCalled();
  });

  it('creates a name-only contact with nullable optional fields', async () => {
    await request(state.app!.getHttpServer())
      .post(endpoint)
      .auth(USER_ROLES.SYSTEM_ADMIN, { type: 'bearer' })
      .send({ name: '  דנה ישראלי  ' })
      .expect(201);
    expect(repository.create).toHaveBeenCalledWith(
      {
        name: CONTACT_INPUT.name,
        phone: null,
        email: null,
        role: null,
        customerId: CONTACT_TEST_IDS.CUSTOMER,
        createdById: CONTACT_TEST_IDS.USER,
      },
      transaction,
    );
    expect(repository.lockCustomer).toHaveBeenCalledWith(
      CONTACT_TEST_IDS.CUSTOMER,
      transaction,
    );
  });

  it.each([
    { name: '' },
    { name: null },
    { name: 'א' },
    { ...CONTACT_INPUT, phone: '123' },
    { ...CONTACT_INPUT, email: 'bad' },
    { ...CONTACT_INPUT, role: 'א'.repeat(61) },
    { ...CONTACT_INPUT, customerId: CONTACT_TEST_IDS.OTHER_CUSTOMER },
    { ...CONTACT_INPUT, legacySourceCustomerId: CONTACT_TEST_IDS.CUSTOMER },
  ])('rejects invalid or forged fields %#', async (input) => {
    await request(state.app!.getHttpServer())
      .post(endpoint)
      .auth(USER_ROLES.SYSTEM_ADMIN, { type: 'bearer' })
      .send(input)
      .expect(400);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('accepts a full200character customer-name contact without truncation and rejects201', async () => {
    const name = 'א'.repeat(200);
    await request(state.app!.getHttpServer())
      .post(endpoint)
      .auth(USER_ROLES.SYSTEM_ADMIN, { type: 'bearer' })
      .send({ name })
      .expect(201);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ name }),
      transaction,
    );
    await request(state.app!.getHttpServer())
      .post(endpoint)
      .auth(USER_ROLES.SYSTEM_ADMIN, { type: 'bearer' })
      .send({ name: `${name}א` })
      .expect(400);
    expect(repository.create).toHaveBeenCalledTimes(1);
  });

  it('reuses an exact tuple without updating it', async () => {
    repository.findExact.mockResolvedValueOnce(STORED_CONTACT);
    await request(state.app!.getHttpServer())
      .post(endpoint)
      .auth(USER_ROLES.SYSTEM_ADMIN, { type: 'bearer' })
      .send(CONTACT_INPUT)
      .expect(201);
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('rejects a missing customer before any contact write', async () => {
    repository.lockCustomer.mockResolvedValueOnce(false);
    await request(state.app!.getHttpServer())
      .post(endpoint)
      .auth(USER_ROLES.SYSTEM_ADMIN, { type: 'bearer' })
      .send(CONTACT_INPUT)
      .expect(404);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('scopes update lookup to the requested customer', async () => {
    repository.findById.mockResolvedValueOnce(null);
    await request(state.app!.getHttpServer())
      .patch(`${endpoint}/${CONTACT_TEST_IDS.CONTACT}`)
      .auth(USER_ROLES.SYSTEM_ADMIN, { type: 'bearer' })
      .send({ role: 'רוכשת' })
      .expect(404);
    expect(repository.findById).toHaveBeenCalledWith(
      CONTACT_TEST_IDS.CUSTOMER,
      CONTACT_TEST_IDS.CONTACT,
      transaction,
    );
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('updates optional fields without changing ownership', async () => {
    await request(state.app!.getHttpServer())
      .patch(`${endpoint}/${CONTACT_TEST_IDS.CONTACT}`)
      .auth(USER_ROLES.SYSTEM_ADMIN, { type: 'bearer' })
      .send({ phone: null })
      .expect(200);
    expect(repository.update).toHaveBeenCalledWith(
      CONTACT_TEST_IDS.CUSTOMER,
      CONTACT_TEST_IDS.CONTACT,
      { ...CONTACT_INPUT, phone: null },
      transaction,
    );
  });

  it('returns the refreshed persisted update timestamp', async () => {
    const updated = {
      ...STORED_CONTACT,
      role: 'רוכשת',
      updatedAt: new Date('2026-10-28T01:00:00Z'),
    };
    repository.findById
      .mockResolvedValueOnce({ ...STORED_CONTACT, get: () => STORED_CONTACT })
      .mockResolvedValueOnce({ ...updated, get: () => updated });
    const result = await request(state.app!.getHttpServer())
      .patch(`${endpoint}/${CONTACT_TEST_IDS.CONTACT}`)
      .auth(USER_ROLES.SYSTEM_ADMIN, { type: 'bearer' })
      .send({ role: 'רוכשת' })
      .expect(200);
    expect(result.body).toMatchObject({
      updatedAt: updated.updatedAt.toISOString(),
      role: updated.role,
    });
  });

  it('propagates a disappeared updated record instead of returning a stale snapshot', async () => {
    repository.findById
      .mockResolvedValueOnce({ ...STORED_CONTACT, get: () => STORED_CONTACT })
      .mockResolvedValueOnce(null);
    await request(state.app!.getHttpServer())
      .patch(`${endpoint}/${CONTACT_TEST_IDS.CONTACT}`)
      .auth(USER_ROLES.SYSTEM_ADMIN, { type: 'bearer' })
      .send({ role: 'רוכשת' })
      .expect(404);
  });

  it('rejects name null on update instead of clearing the required name', async () => {
    await request(state.app!.getHttpServer())
      .patch(`${endpoint}/${CONTACT_TEST_IDS.CONTACT}`)
      .auth(USER_ROLES.SYSTEM_ADMIN, { type: 'bearer' })
      .send({ name: null })
      .expect(400);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('rejects updates colliding with another contact', async () => {
    repository.findExact.mockResolvedValueOnce({
      ...STORED_CONTACT,
      id: 'another-contact',
    });
    await request(state.app!.getHttpServer())
      .patch(`${endpoint}/${CONTACT_TEST_IDS.CONTACT}`)
      .auth(USER_ROLES.SYSTEM_ADMIN, { type: 'bearer' })
      .send({ role: 'רוכשת' })
      .expect(409);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('passes write failure out of the transaction rather than reporting success', async () => {
    repository.create.mockRejectedValueOnce(new Error('write failed'));
    await request(state.app!.getHttpServer())
      .post(endpoint)
      .auth(USER_ROLES.SYSTEM_ADMIN, { type: 'bearer' })
      .send(CONTACT_INPUT)
      .expect(500);
  });
});
