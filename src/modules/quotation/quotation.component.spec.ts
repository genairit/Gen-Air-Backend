import {
  ValidationPipe,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';

import {
  PERMISSIONS,
  type PermissionType,
} from '@Constants/authorization.constant';

import request from 'supertest';
import { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from '@Guards/auth.guard';
import { QuotationService } from './quotation.service';
import { AuthService } from '@Modules/auth/auth.service';
import { QuotationController } from './quotation.controller';
import { authorizedUser } from '../../testing/authorization.fixture';
import type { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import { CatalogueItemService } from '@Modules/catalogue-item/catalogue-item.service';
import { QuotationRuleService } from '@Modules/quotation-rule/quotation-rule.service';
import { CatalogueItemController } from '@Modules/catalogue-item/catalogue-item.controller';
import { QuotationRuleController } from '@Modules/quotation-rule/quotation-rule.controller';

const id = randomUUID(),
  customerId = randomUUID();
const state: { app: INestApplication<Server> | null; actor: IAuthorizedUser } =
  { app: null, actor: authorizedUser() };
const quotation = {
  list: jest.fn(() => Promise.resolve({ items: [], nextCursor: null })),
  getById: jest.fn(() => Promise.resolve({ id })),
  create: jest.fn(() => Promise.resolve({ id })),
  save: jest.fn(() => Promise.resolve({ id })),
  transition: jest.fn(() => Promise.resolve({ id })),
  acknowledge: jest.fn(() => Promise.resolve({ id })),
};
const catalogue = {
  getById: jest.fn(() => Promise.resolve({ id })),
  search: jest.fn(() => Promise.resolve([])),
  listForMaintenance: jest.fn(() => Promise.resolve([])),
  update: jest.fn(() => Promise.resolve({ id })),
};
const rules = { configuration: jest.fn(() => Promise.resolve({ rules: [] })) };
const authenticate = jest.fn((token: string) => {
  if (token !== 'valid') {
    throw new UnauthorizedException();
  }
  return Promise.resolve(state.actor);
});
const server = (): Server => {
  if (!state.app) {
    throw new Error('Test server unavailable');
  }
  return state.app.getHttpServer();
};
const savePayload = () => ({
  version: 1,
  customerId,
  projectId: null,
  date: '2026-10-31',
  brand: 'אלקטרה',
  paymentTerms: 'prepaid',
  paymentTermsNote: '',
  paymentSchedule: [],
  discountPercent: '0',
  targetPretaxAmount: null,
  internalNotes: '',
  sections: [],
});
const ROUTES: [string, string, PermissionType][] = [
  ['get', '/quotation', PERMISSIONS.QUOTATIONS_READ],
  ['get', `/quotation/${id}`, PERMISSIONS.QUOTATIONS_READ],
  ['post', '/quotation', PERMISSIONS.QUOTATIONS_CREATE],
  ['put', `/quotation/${id}`, PERMISSIONS.QUOTATIONS_UPDATE],
  ['post', `/quotation/${id}/review`, PERMISSIONS.QUOTATIONS_APPROVE],
  ['post', `/quotation/${id}/warnings`, PERMISSIONS.QUOTATIONS_APPROVE],
  ['get', '/catalogue-item', PERMISSIONS.QUOTATIONS_READ],
  ['get', `/catalogue-item/${id}`, PERMISSIONS.QUOTATIONS_READ],
  ['get', '/catalogue-item/maintenance', PERMISSIONS.CATALOGUE_MANAGE],
  ['patch', `/catalogue-item/${id}`, PERMISSIONS.CATALOGUE_MANAGE],
  ['get', '/quotation-rule', PERMISSIONS.QUOTATIONS_READ],
];
const call = (method: string, path: string) => {
  const client = request(server());
  const operations: Record<string, () => request.Test> = {
    get: () => client.get(path),
    post: () => client.post(path),
    put: () => client.put(path),
    patch: () => client.patch(path),
  };
  return operations[method]();
};
beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [
      QuotationController,
      CatalogueItemController,
      QuotationRuleController,
    ],
    providers: [
      { provide: AuthService, useValue: { authenticate } },
      { provide: APP_GUARD, useClass: AuthGuard },
      { provide: QuotationService, useValue: quotation },
      { provide: CatalogueItemService, useValue: catalogue },
      { provide: QuotationRuleService, useValue: rules },
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
  state.actor = authorizedUser();
});
afterAll(async () => {
  await state.app?.close();
});
describe('Quotation HTTP grants and DTO boundaries', () => {
  test.each(ROUTES)(
    '%s %s rejects unauthenticated access',
    async (method, path) => {
      await call(method, path).expect(401);
    },
  );
  test.each(ROUTES)(
    '%s %s rejects users without its action permission',
    async (method, path) => {
      state.actor = { ...authorizedUser(), permissions: [] };
      await call(method, path).set('Authorization', 'Bearer valid').expect(403);
    },
  );
  test.each(ROUTES.filter(([method]) => method === 'get'))(
    '%s %s accepts its precise read grant',
    async (method, path, permission) => {
      state.actor = { ...authorizedUser(), permissions: [permission] };
      await call(method, path).set('Authorization', 'Bearer valid').expect(200);
    },
  );
  test('valid customer-first POST delegates acting user, no project required', async () => {
    state.actor = {
      ...authorizedUser(),
      permissions: [PERMISSIONS.QUOTATIONS_CREATE],
    };
    await request(server())
      .post('/quotation')
      .set('Authorization', 'Bearer valid')
      .send({ customerId })
      .expect(201);
    expect(quotation.create).toHaveBeenCalledWith(
      { customerId },
      state.actor.id,
    );
  });
  test.each([
    {},
    { customerId: 'bad' },
    { customerId, sections: [] },
    { customerId, status: 'approved' },
  ])('rejects invalid create or forged fields %j', async (body) => {
    state.actor = {
      ...authorizedUser(),
      permissions: [PERMISSIONS.QUOTATIONS_CREATE],
    };
    await request(server())
      .post('/quotation')
      .set('Authorization', 'Bearer valid')
      .send(body)
      .expect(400);
    expect(quotation.create).not.toHaveBeenCalled();
  });
  test('valid save delegates normalized body but rejects forged totals/rules', async () => {
    state.actor = {
      ...authorizedUser(),
      permissions: [PERMISSIONS.QUOTATIONS_UPDATE],
    };
    await request(server())
      .put(`/quotation/${id}`)
      .set('Authorization', 'Bearer valid')
      .send(savePayload())
      .expect(200);
    expect(quotation.save).toHaveBeenCalled();
    for (const extra of [
      { totals: { total: '1' } },
      { ruleConfigFingerprint: 'fake' },
      { vatRate: '0' },
      { status: 'approved' },
    ]) {
      await request(server())
        .put(`/quotation/${id}`)
        .set('Authorization', 'Bearer valid')
        .send({ ...savePayload(), ...extra })
        .expect(400);
    }
  });
  test.each([
    { version: 0 },
    { date: 'not-date' },
    { date: '2026-02-30' },
    { discountPercent: '-1' },
    { targetPretaxAmount: 'NaN' },
    { customerId: null },
    { projectId: 'bad' },
    {
      sections: [
        { id: randomUUID(), title: 'x', systemType: 'bad', items: [] },
      ],
    },
  ])('rejects invalid save %j', async (changes) => {
    state.actor = {
      ...authorizedUser(),
      permissions: [PERMISSIONS.QUOTATIONS_UPDATE],
    };
    await request(server())
      .put(`/quotation/${id}`)
      .set('Authorization', 'Bearer valid')
      .send({ ...savePayload(), ...changes })
      .expect(400);
    expect(quotation.save).not.toHaveBeenCalled();
  });
  test('rejects missing catalogue reference and malformed nested quantities', async () => {
    state.actor = {
      ...authorizedUser(),
      permissions: [PERMISSIONS.QUOTATIONS_UPDATE],
    };
    const item = {
      id: randomUUID(),
      parentItemId: null,
      description: 'manual',
      quotedPrice: '1',
      quantity: '1',
      location: '',
      circuit: null,
      requestedCapacityBtu: null,
    };
    await request(server())
      .put(`/quotation/${id}`)
      .set('Authorization', 'Bearer valid')
      .send({
        ...savePayload(),
        sections: [
          { id: randomUUID(), title: '', systemType: 'GEN', items: [item] },
        ],
      })
      .expect(400);
  });
  test.each(['price', 'unit', 'description', 'status', 'preference'])(
    'explicit null catalogue %s rejects400 rather than DB500',
    async (field) => {
      state.actor = {
        ...authorizedUser(),
        permissions: [PERMISSIONS.CATALOGUE_MANAGE],
      };
      await request(server())
        .patch(`/catalogue-item/${id}`)
        .set('Authorization', 'Bearer valid')
        .send({ [field]: null })
        .expect(400);
      expect(catalogue.update).not.toHaveBeenCalled();
    },
  );
  test('catalogue zero price valid, physical-delete action absent', async () => {
    state.actor = {
      ...authorizedUser(),
      permissions: [PERMISSIONS.CATALOGUE_MANAGE],
    };
    await request(server())
      .patch(`/catalogue-item/${id}`)
      .set('Authorization', 'Bearer valid')
      .send({ price: '0' })
      .expect(200);
    await request(server())
      .delete(`/catalogue-item/${id}`)
      .set('Authorization', 'Bearer valid')
      .expect(404);
  });
  test('approval and warning acknowledgement reject create/update-only users', async () => {
    state.actor = {
      ...authorizedUser(),
      permissions: [
        PERMISSIONS.QUOTATIONS_CREATE,
        PERMISSIONS.QUOTATIONS_UPDATE,
      ],
    };
    await request(server())
      .post(`/quotation/${id}/review`)
      .set('Authorization', 'Bearer valid')
      .send({ version: 1, status: 'approved' })
      .expect(403);
    await request(server())
      .post(`/quotation/${id}/warnings`)
      .set('Authorization', 'Bearer valid')
      .send({ version: 1, warningKeys: [] })
      .expect(403);
  });
  test.each([
    '/quotation?batchCursor=garbage&status=invalid',
    '/quotation?batchSize=51',
    '/catalogue-item?capacityBtu=NaN',
    '/quotation/not-a-uuid',
  ])('rejects invalid query/identifier %s', async (path) => {
    state.actor = {
      ...authorizedUser(),
      permissions: [PERMISSIONS.QUOTATIONS_READ],
    };
    await request(server())
      .get(path)
      .set('Authorization', 'Bearer valid')
      .expect(400);
  });
});
