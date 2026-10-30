import request from 'supertest';
import { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import { AuthGuard } from '@Guards/auth.guard';
import { AuthService } from '@Modules/auth/auth.service';
import { APP_GUARD, HttpAdapterHost } from '@nestjs/core';
import { USER_ROLES } from '@Constants/user-role.constant';
import { GeneralFilter } from '../../filters/http-error.filter';
import { IMPORT_CREATOR } from './testing/apartment-import.fixture';
import { APARTMENT_IMPORT } from './constants/apartment-import.constant';
import { baselinePermissions } from '../../testing/authorization.fixture';
import { INestApplication, UnprocessableEntityException } from '@nestjs/common';
import { ProjectApartmentImportService } from './project-apartment-import.service';
import { ProjectApartmentImportController } from './project-apartment-import.controller';

const endpoint =
  '/project/11111111-1111-4111-8111-111111111111/apartments/import';

describe('apartment import HTTP boundary', () => {
  const state: { app: INestApplication<Server> | null } = { app: null };
  const imports = {
    import: jest.fn().mockResolvedValue({
      counts: { created: 1, existing: 0, duplicate: 0, error: 0 },
      rows: [],
      reportBase64: null,
    }),
    template: jest.fn().mockResolvedValue(Buffer.from('template')),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ProjectApartmentImportController],
      providers: [
        { provide: ProjectApartmentImportService, useValue: imports },
        { provide: APP_GUARD, useClass: AuthGuard },
        {
          provide: AuthService,
          useValue: {
            authenticate: (role: string) =>
              Promise.resolve({
                ...IMPORT_CREATOR,
                role,
                permissions: baselinePermissions(role),
              }),
          },
        },
      ],
    }).compile();
    state.app = module.createNestApplication<INestApplication<Server>>();
    state.app.useGlobalFilters(new GeneralFilter(module.get(HttpAdapterHost)));
    await state.app.init();
  });
  beforeEach(() => jest.clearAllMocks());
  afterAll(async () => state.app?.close());
  const server = (): Server => {
    if (!state.app) {
      throw new Error('Application not initialized');
    }
    return state.app.getHttpServer();
  };
  it('requires authentication', async () => {
    await request(server()).post(endpoint).expect(401);
    await request(server()).get(`${endpoint}/template`).expect(401);
    expect(imports.import).not.toHaveBeenCalled();
  });
  it.each(
    Object.values(USER_ROLES).filter(
      (role) => role !== USER_ROLES.SYSTEM_ADMIN,
    ),
  )('does not grant customerwrite to%s', async (role) => {
    await request(server())
      .post(endpoint)
      .auth(role, { type: 'bearer' })
      .attach('file', Buffer.from('file'), 'input.xlsx')
      .expect(403);
    expect(imports.import).not.toHaveBeenCalled();
  });
  it('accepts one bounded upload for admin and passes route scope to service', async () => {
    const result = await request(server())
      .post(endpoint)
      .auth(USER_ROLES.SYSTEM_ADMIN, { type: 'bearer' })
      .attach('file', Buffer.from('file'), {
        filename: 'input.xlsx',
        contentType: APARTMENT_IMPORT.MIME_TYPE,
      })
      .expect(201);
    expect(result.body).toMatchObject({ counts: { created: 1 } });
    expect(imports.import).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      expect.objectContaining({ originalname: 'input.xlsx' }),
      expect.objectContaining({ role: USER_ROLES.SYSTEM_ADMIN }),
    );
  });
  it('rejects oversized and multiple files before the service', async () => {
    await request(server())
      .post(endpoint)
      .auth(USER_ROLES.SYSTEM_ADMIN, { type: 'bearer' })
      .attach(
        'file',
        Buffer.alloc(APARTMENT_IMPORT.MAX_FILE_BYTES + 1),
        'large.xlsx',
      )
      .expect(413);
    await request(server())
      .post(endpoint)
      .auth(USER_ROLES.SYSTEM_ADMIN, { type: 'bearer' })
      .attach('file', Buffer.from('1'), 'one.xlsx')
      .attach('file', Buffer.from('2'), 'two.xlsx')
      .expect(400);
    expect(imports.import).not.toHaveBeenCalled();
  });
  it('rejects body fields and invalid building identifiers', async () => {
    await request(server())
      .post(endpoint)
      .auth(USER_ROLES.SYSTEM_ADMIN, { type: 'bearer' })
      .field('buildingId', 'different')
      .attach('file', Buffer.from('file'), 'file.xlsx')
      .expect(400);
    await request(server())
      .post('/project/not-uuid/apartments/import')
      .auth(USER_ROLES.SYSTEM_ADMIN, { type: 'bearer' })
      .attach('file', Buffer.from('file'), 'file.xlsx')
      .expect(400);
    expect(imports.import).not.toHaveBeenCalled();
  });
  it('preserves INVALID_TEMPLATE through the production global error filter', async () => {
    imports.import.mockRejectedValueOnce(
      new UnprocessableEntityException({
        code: APARTMENT_IMPORT.TEMPLATE_ERROR,
        message: 'Invalid apartment import template',
      }),
    );
    const result = await request(server())
      .post(endpoint)
      .auth(USER_ROLES.SYSTEM_ADMIN, { type: 'bearer' })
      .attach('file', Buffer.from('file'), 'input.xlsx')
      .expect(422);
    expect(result.body).toMatchObject({
      statusCode: 422,
      code: APARTMENT_IMPORT.TEMPLATE_ERROR,
    });
  });

  it('downloads authenticated XLSX template', async () => {
    const result = await request(server())
      .get(`${endpoint}/template`)
      .auth(USER_ROLES.SYSTEM_ADMIN, { type: 'bearer' })
      .expect(200);
    expect(result.headers['content-type']).toContain(
      APARTMENT_IMPORT.MIME_TYPE,
    );
  });
});
