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
import { AuthService } from '@Modules/auth/auth.service';
import { authorizedUser } from '../authorization.fixture';
import { QuotationService } from '../../modules/quotation/quotation.service';
import type { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import { QuotationController } from '../../modules/quotation/quotation.controller';
import { CatalogueItemService } from '@Modules/catalogue-item/catalogue-item.service';
import { QuotationRuleService } from '@Modules/quotation-rule/quotation-rule.service';
import { QUOTATION_STATUS } from '../../modules/quotation/constants/quotation.constant';
import { CatalogueItemController } from '@Modules/catalogue-item/catalogue-item.controller';
import { QuotationRuleController } from '@Modules/quotation-rule/quotation-rule.controller';
import type { IQuotationDetailView } from '../../modules/quotation/interfaces/quotation-document.interface';

const id = randomUUID(),
  customerId = randomUUID();
const state: { app: INestApplication<Server> | null; actor: IAuthorizedUser } =
  { app: null, actor: authorizedUser() };
const quotation = {
  list: jest.fn(() => Promise.resolve({ items: [], nextCursor: null })),
  statusCounts: jest.fn(() =>
    Promise.resolve({ all: 5, draft: 2, review: 1, approved: 1, cancelled: 1 }),
  ),
  salesAgents: jest.fn(() => Promise.resolve([])),
  getById: jest.fn(() => Promise.resolve({ id })),
  getForActor: jest.fn(() => Promise.resolve({ id })),
  projectDetailsForActor: jest.fn(
    (detail: IQuotationDetailView, actor: IAuthorizedUser) =>
      actor.permissions.includes(PERMISSIONS.PROJECTS_READ)
        ? detail
        : { ...detail, primaryProject: null, apartmentLinks: [] },
  ),
  create: jest.fn(() => Promise.resolve({ id })),
  save: jest.fn(() => Promise.resolve({ id })),
  updateSalesAgent: jest.fn(() => Promise.resolve({ id })),
  delete: jest.fn(() => Promise.resolve()),
  transition: jest.fn(() => Promise.resolve({ id })),
  cancel: jest.fn(() => Promise.resolve({ id })),
  restore: jest.fn(() => Promise.resolve({ id })),
  acknowledge: jest.fn(() => Promise.resolve({ id })),
  listByProject: jest.fn(() =>
    Promise.resolve({ items: [], total: 0, nextCursor: null }),
  ),
  apartmentOptions: jest.fn(() => Promise.resolve({ apartments: [] })),
  setApartmentLinks: jest.fn(() => Promise.resolve({ id })),
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
  ['get', '/quotation/status-counts', PERMISSIONS.QUOTATIONS_READ],
  ['get', '/quotation/sales-agents', PERMISSIONS.QUOTATIONS_READ],
  ['get', `/quotation/${id}`, PERMISSIONS.QUOTATIONS_READ],
  ['get', `/quotation/project/${id}`, PERMISSIONS.QUOTATIONS_READ],
  ['get', `/quotation/${id}/apartment-options`, PERMISSIONS.QUOTATIONS_READ],
  ['put', `/quotation/${id}/apartment-links`, PERMISSIONS.QUOTATIONS_UPDATE],
  ['post', '/quotation', PERMISSIONS.QUOTATIONS_CREATE],
  ['put', `/quotation/${id}`, PERMISSIONS.QUOTATIONS_UPDATE],
  ['patch', `/quotation/${id}/sales-agent`, PERMISSIONS.QUOTATIONS_UPDATE],
  ['delete', `/quotation/${id}`, PERMISSIONS.QUOTATIONS_DELETE],
  ['post', `/quotation/${id}/review`, PERMISSIONS.QUOTATIONS_APPROVE],
  ['post', `/quotation/${id}/cancel`, PERMISSIONS.QUOTATIONS_UPDATE],
  ['post', `/quotation/${id}/restore`, PERMISSIONS.QUOTATIONS_UPDATE],
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
    delete: () => client.delete(path),
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
  test.each(
    ROUTES.filter(
      ([method, path]) =>
        method === 'get' && path !== '/quotation/sales-agents',
    ),
  )(
    '%s %s accepts its precise read grant',
    async (method, path, permission) => {
      const projectScoped = [
        `/quotation/project/${id}`,
        `/quotation/${id}/apartment-options`,
      ].includes(path);
      const permissions = projectScoped
        ? [permission, PERMISSIONS.PROJECTS_READ]
        : [permission];
      state.actor = { ...authorizedUser(), permissions };
      await call(method, path).set('Authorization', 'Bearer valid').expect(200);
    },
  );
  test.each([`/quotation/project/${id}`, `/quotation/${id}/apartment-options`])(
    '%s rejects a quotation-only grant',
    async (path) => {
      state.actor = {
        ...authorizedUser(),
        permissions: [PERMISSIONS.QUOTATIONS_READ],
      };
      await call('get', path).set('Authorization', 'Bearer valid').expect(403);
    },
  );
  test('status-counts resolves before UUID routes and delegates validated search', async () => {
    state.actor = {
      ...authorizedUser(),
      permissions: [PERMISSIONS.QUOTATIONS_READ],
    };
    const response = await request(server())
      .get('/quotation/status-counts')
      .query({ search: 'לקוח %_' })
      .set('Authorization', 'Bearer valid')
      .expect(200);
    expect(response.body).toEqual({
      all: 5,
      draft: 2,
      review: 1,
      approved: 1,
      cancelled: 1,
    });
    expect(quotation.statusCounts).toHaveBeenCalledWith({ search: 'לקוח %_' });
    expect(quotation.getById).not.toHaveBeenCalled();
  });
  test.each([
    { search: 'x'.repeat(201) },
    { search: ['one', 'two'] },
    { batchSize: 1 },
    { status: QUOTATION_STATUS.DRAFT },
  ])('status-counts rejects malformed or unrelated query %j', async (query) => {
    state.actor = {
      ...authorizedUser(),
      permissions: [PERMISSIONS.QUOTATIONS_READ],
    };
    await request(server())
      .get('/quotation/status-counts')
      .query(query)
      .set('Authorization', 'Bearer valid')
      .expect(400);
    expect(quotation.statusCounts).not.toHaveBeenCalled();
  });
  test('status-counts accepts the maximum search length', async () => {
    state.actor = {
      ...authorizedUser(),
      permissions: [PERMISSIONS.QUOTATIONS_READ],
    };
    await request(server())
      .get('/quotation/status-counts')
      .query({ search: 'x'.repeat(200) })
      .set('Authorization', 'Bearer valid')
      .expect(200);
    expect(quotation.statusCounts).toHaveBeenCalledWith({
      search: 'x'.repeat(200),
    });
  });
  test('sales-agents requires employee read access as well as quotation read access', async () => {
    state.actor = {
      ...authorizedUser(),
      permissions: [PERMISSIONS.QUOTATIONS_READ],
    };

    await request(server())
      .get('/quotation/sales-agents')
      .set('Authorization', 'Bearer valid')
      .expect(403);
    expect(quotation.salesAgents).not.toHaveBeenCalled();

    state.actor = {
      ...authorizedUser(),
      permissions: [PERMISSIONS.EMPLOYEES_READ],
    };
    await request(server())
      .get('/quotation/sales-agents')
      .set('Authorization', 'Bearer valid')
      .expect(403);
    expect(quotation.salesAgents).not.toHaveBeenCalled();

    state.actor = {
      ...authorizedUser(),
      permissions: [PERMISSIONS.QUOTATIONS_READ, PERMISSIONS.EMPLOYEES_READ],
    };

    await request(server())
      .get('/quotation/sales-agents')
      .set('Authorization', 'Bearer valid')
      .expect(200);

    expect(quotation.salesAgents).toHaveBeenCalledTimes(1);
  });
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
      false,
    );
  });
  test.each([
    {},
    { customerId: 'bad' },
    { customerId, sections: [] },
    { customerId, status: QUOTATION_STATUS.APPROVED },
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
      { status: QUOTATION_STATUS.APPROVED },
    ]) {
      await request(server())
        .put(`/quotation/${id}`)
        .set('Authorization', 'Bearer valid')
        .send({ ...savePayload(), ...extra })
        .expect(400);
    }
  });
  test('valid sales-agent update delegates its versioned nullable association', async () => {
    state.actor = {
      ...authorizedUser(),
      permissions: [PERMISSIONS.QUOTATIONS_UPDATE],
    };
    const salesAgentId = randomUUID();

    await request(server())
      .patch(`/quotation/${id}/sales-agent`)
      .set('Authorization', 'Bearer valid')
      .send({ version: 3, salesAgentId })
      .expect(200);

    expect(quotation.updateSalesAgent).toHaveBeenCalledWith(
      id,
      { version: 3, salesAgentId },
      state.actor.id,
      false,
    );
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
      .send({ version: 1, status: QUOTATION_STATUS.APPROVED })
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

const remove = (
  body: object = { version: 1 },
  path: string = id,
  token = 'valid',
) =>
  request(server())
    .delete(`/quotation/${path}`)
    .set('Authorization', `Bearer ${token}`)
    .send(body);

describe('Quotation deletion HTTP contract', () => {
  beforeEach(() => {
    state.actor = {
      ...authorizedUser(),
      permissions: [PERMISSIONS.QUOTATIONS_DELETE],
    };
  });
  test('precise delete grant delegates version and authenticated actor, returning empty 204', async () => {
    const response = await remove().expect(204);
    expect(response.text).toBe('');
    expect(quotation.delete).toHaveBeenCalledWith(
      id,
      { version: 1 },
      state.actor.id,
    );
  });
  test('maximum safe integer version is accepted', async () => {
    await remove({ version: Number.MAX_SAFE_INTEGER }).expect(204);
  });
  test.each([
    {},
    { version: null },
    { version: 0 },
    { version: -1 },
    { version: 1.5 },
    { version: '1' },
    { version: Number.MAX_SAFE_INTEGER + 1 },
    { version: true },
    { version: 1, deletedAt: '2026-01-01' },
    { version: 1, updatedById: randomUUID() },
    { version: 1, status: QUOTATION_STATUS.APPROVED },
  ])('rejects malformed version or forged fields %j', async (body) => {
    await remove(body).expect(400);
    expect(quotation.delete).not.toHaveBeenCalled();
  });
  test('invalid UUID never reaches service', async () => {
    await remove({ version: 1 }, 'invalid').expect(400);
    expect(quotation.delete).not.toHaveBeenCalled();
  });
  test('anonymous token is rejected', async () => {
    await remove({ version: 1 }, id, 'invalid').expect(401);
    expect(quotation.delete).not.toHaveBeenCalled();
  });
  test.each(
    [
      [],
      [PERMISSIONS.QUOTATIONS_READ],
      [
        PERMISSIONS.QUOTATIONS_CREATE,
        PERMISSIONS.QUOTATIONS_UPDATE,
        PERMISSIONS.QUOTATIONS_APPROVE,
      ],
    ].map((permissions) => ({ permissions })),
  )('other quotation grants cannot delete: %j', async ({ permissions }) => {
    state.actor = { ...authorizedUser(), permissions };
    await remove().expect(403);
    expect(quotation.delete).not.toHaveBeenCalled();
  });
});

const shareApartments = (body: object) =>
  request(server())
    .put(`/quotation/${id}/apartment-links`)
    .set('Authorization', 'Bearer valid')
    .send(body);

describe('Quotation apartment sharing HTTP contract', () => {
  beforeEach(() => {
    state.actor = {
      ...authorizedUser(),
      permissions: [PERMISSIONS.QUOTATIONS_UPDATE, PERMISSIONS.PROJECTS_READ],
    };
  });
  test('update grant sets the full apartment list in one request', async () => {
    const apartmentIds = [randomUUID(), randomUUID()];
    await shareApartments({ apartmentIds, expectedApartmentIds: [] }).expect(
      200,
    );
    expect(quotation.setApartmentLinks).toHaveBeenCalledWith(id, {
      apartmentIds,
      expectedApartmentIds: [],
    });
    expect(quotation.save).not.toHaveBeenCalled();
  });
  test('an empty list turns sharing off', async () => {
    await shareApartments({
      apartmentIds: [],
      expectedApartmentIds: [],
    }).expect(200);
    expect(quotation.setApartmentLinks).toHaveBeenCalledWith(id, {
      apartmentIds: [],
      expectedApartmentIds: [],
    });
  });
  test.each([
    {},
    { apartmentIds: null },
    { apartmentIds: 'all' },
    { apartmentIds: ['not-a-uuid'] },
    { apartmentIds: [id, id] },
    { apartmentIds: Array.from({ length: 2001 }, () => randomUUID()) },
    { apartmentIds: [], expectedApartmentIds: ['not-a-uuid'] },
    { apartmentIds: [], expectedApartmentIds: [id, id] },
    { apartmentIds: [], expectedApartmentIds: [], version: 2 },
    { apartmentIds: [], expectedApartmentIds: [], status: 'draft' },
  ])('rejects malformed or forged sharing body %j', async (body) => {
    await shareApartments(body).expect(400);
    expect(quotation.setApartmentLinks).not.toHaveBeenCalled();
  });
  test.each(
    [
      [PERMISSIONS.QUOTATIONS_READ],
      [PERMISSIONS.QUOTATIONS_APPROVE, PERMISSIONS.QUOTATIONS_CREATE],
      [PERMISSIONS.QUOTATIONS_UPDATE],
    ].map((permissions) => ({ permissions })),
  )('read or approve grants cannot edit links: %j', async ({ permissions }) => {
    state.actor = { ...authorizedUser(), permissions };
    await shareApartments({
      apartmentIds: [],
      expectedApartmentIds: [],
    }).expect(403);
    expect(quotation.setApartmentLinks).not.toHaveBeenCalled();
  });
  test('project list resolves before UUID routes and validates paging', async () => {
    state.actor = {
      ...authorizedUser(),
      permissions: [PERMISSIONS.QUOTATIONS_READ, PERMISSIONS.PROJECTS_READ],
    };
    await request(server())
      .get(`/quotation/project/${id}`)
      .query({ batchSize: 10 })
      .set('Authorization', 'Bearer valid')
      .expect(200);
    expect(quotation.listByProject).toHaveBeenCalledWith(id, { batchSize: 10 });
    expect(quotation.getById).not.toHaveBeenCalled();
    for (const query of [
      { batchSize: 51 },
      { search: 'x' },
      { status: 'draft' },
    ]) {
      await request(server())
        .get(`/quotation/project/${id}`)
        .query(query)
        .set('Authorization', 'Bearer valid')
        .expect(400);
    }
    await request(server())
      .get('/quotation/project/not-a-uuid')
      .set('Authorization', 'Bearer valid')
      .expect(400);
  });
});

describe('Quotation order and cancellation HTTP contract', () => {
  test('order transition forwards only the selected quotation and status', async () => {
    state.actor = {
      ...authorizedUser(),
      permissions: [PERMISSIONS.QUOTATIONS_APPROVE],
    };
    const body = {
      version: 3,
      status: QUOTATION_STATUS.APPROVED,
    };
    await request(server())
      .post(`/quotation/${id}/review`)
      .set('Authorization', 'Bearer valid')
      .send(body)
      .expect(201);
    expect(quotation.transition).toHaveBeenCalledWith(id, body, state.actor.id);
  });

  test('manual cancellation and restoration forward version and authenticated actor', async () => {
    state.actor = {
      ...authorizedUser(),
      permissions: [PERMISSIONS.QUOTATIONS_UPDATE],
    };
    const body = { version: 4, reason: 'Project withdrawn' };
    await request(server())
      .post(`/quotation/${id}/cancel`)
      .set('Authorization', 'Bearer valid')
      .send(body)
      .expect(201);
    expect(quotation.cancel).toHaveBeenCalledWith(id, body, state.actor);
    const restoreBody = { version: 4 };
    await request(server())
      .post(`/quotation/${id}/restore`)
      .set('Authorization', 'Bearer valid')
      .send(restoreBody)
      .expect(201);
    expect(quotation.restore).toHaveBeenCalledWith(
      id,
      restoreBody,
      state.actor,
    );
  });

  test.each(['cancel', 'restore'] as const)(
    '%s response hides linked project metadata without projects.read',
    async (action) => {
      const detail = {
        id,
        primaryProject: { id: randomUUID(), name: 'Private project' },
        apartmentLinks: [{ apartmentId: randomUUID(), apartmentNumber: '7' }],
      };
      const body =
        action === 'cancel'
          ? { version: 4, reason: 'Project withdrawn' }
          : { version: 4 };
      quotation[action].mockResolvedValueOnce(detail);
      state.actor = {
        ...authorizedUser(),
        permissions: [PERMISSIONS.QUOTATIONS_UPDATE],
      };

      const redacted = await request(server())
        .post(`/quotation/${id}/${action}`)
        .set('Authorization', 'Bearer valid')
        .send(body)
        .expect(201);
      expect(redacted.body).toEqual({
        id,
        primaryProject: null,
        apartmentLinks: [],
      });
      expect(quotation.projectDetailsForActor).toHaveBeenCalledWith(
        detail,
        state.actor,
      );

      quotation[action].mockResolvedValueOnce(detail);
      state.actor = {
        ...authorizedUser(),
        permissions: [PERMISSIONS.QUOTATIONS_UPDATE, PERMISSIONS.PROJECTS_READ],
      };
      const projectReader = await request(server())
        .post(`/quotation/${id}/${action}`)
        .set('Authorization', 'Bearer valid')
        .send(body)
        .expect(201);
      expect(projectReader.body).toEqual(detail);
      expect(quotation.projectDetailsForActor).toHaveBeenCalledWith(
        detail,
        state.actor,
      );
    },
  );

  test('manual cancellation rejects missing and blank reasons', async () => {
    state.actor = {
      ...authorizedUser(),
      permissions: [PERMISSIONS.QUOTATIONS_UPDATE],
    };
    await request(server())
      .post(`/quotation/${id}/cancel`)
      .set('Authorization', 'Bearer valid')
      .send({ version: 1 })
      .expect(400);
    await request(server())
      .post(`/quotation/${id}/cancel`)
      .set('Authorization', 'Bearer valid')
      .send({ version: 1, reason: '   ' })
      .expect(400);
    expect(quotation.cancel).not.toHaveBeenCalled();
  });
});
