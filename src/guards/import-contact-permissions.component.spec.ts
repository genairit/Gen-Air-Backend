import request from 'supertest';
import { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth.guard';
import { INestApplication } from '@nestjs/common';
import { AuthService } from '@Modules/auth/auth.service';
import { USER_ROLES } from '@Constants/user-role.constant';
import { authorizedUser } from '../testing/authorization.fixture';
import { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import { PERMISSIONS, PermissionType } from '@Constants/authorization.constant';
import { ProjectApartmentImportService } from '@Modules/project/project-apartment-import.service';
import { ProjectApartmentImportController } from '@Modules/project/project-apartment-import.controller';

interface IPermissionState {
  actor: IAuthorizedUser;
  app: INestApplication<Server> | null;
}

const REQUIRED_IMPORT_PERMISSIONS = [
  PERMISSIONS.APARTMENTS_CREATE,
  PERMISSIONS.CUSTOMERS_CREATE,
  PERMISSIONS.CUSTOMERS_UPDATE,
];
const SCOPE_ID = '11111111-1111-4111-8111-111111111111';
const IMPORT_ENDPOINT = `/project/${SCOPE_ID}/apartments/import`;
const TOKEN = 'unchanged-token';

describe('import and contact effective-grant boundaries', () => {
  const state: IPermissionState = { actor: authorizedUser(), app: null };
  const imports = {
    import: jest.fn().mockResolvedValue({
      counts: { created: 0, existing: 0, duplicate: 0, error: 0 },
      rows: [],
      reportBase64: null,
    }),
    template: jest.fn().mockResolvedValue(Buffer.from('template')),
  };
  const authenticate = jest.fn(() => Promise.resolve(state.actor));
  const server = (): Server => {
    if (!state.app) {
      throw new Error('Permission test app was not initialized');
    }

    return state.app.getHttpServer();
  };
  const setPermissions = (permissions: PermissionType[]): void => {
    state.actor = authorizedUser(permissions);
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ProjectApartmentImportController],
      providers: [
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: AuthService, useValue: { authenticate } },
        { provide: ProjectApartmentImportService, useValue: imports },
      ],
    }).compile();
    state.app = module.createNestApplication<INestApplication<Server>>();
    await state.app.init();
  });
  beforeEach(() => {
    setPermissions([]);
    jest.clearAllMocks();
  });
  afterAll(async () => state.app?.close());

  it.each(REQUIRED_IMPORT_PERMISSIONS)(
    'denies import and template when %s is missing, even for admin',
    async (missing) => {
      setPermissions(
        REQUIRED_IMPORT_PERMISSIONS.filter(
          (permission) => permission !== missing,
        ),
      );
      await request(server())
        .post(IMPORT_ENDPOINT)
        .auth(TOKEN, { type: 'bearer' })
        .expect(403);
      await request(server())
        .get(`${IMPORT_ENDPOINT}/template`)
        .auth(TOKEN, { type: 'bearer' })
        .expect(403);
      expect(imports.import).not.toHaveBeenCalled();
      expect(imports.template).not.toHaveBeenCalled();
    },
  );

  it('does not infer import privilege from the admin role', async () => {
    await request(server())
      .post(IMPORT_ENDPOINT)
      .auth(TOKEN, { type: 'bearer' })
      .expect(403);
  });

  it('allows a non-admin with all explicit import grants and honors same-token revocation', async () => {
    state.actor = {
      ...authorizedUser(REQUIRED_IMPORT_PERMISSIONS),
      role: USER_ROLES.SECRETARY,
    };
    await request(server())
      .post(IMPORT_ENDPOINT)
      .auth(TOKEN, { type: 'bearer' })
      .expect(201);
    await request(server())
      .get(`${IMPORT_ENDPOINT}/template`)
      .auth(TOKEN, { type: 'bearer' })
      .expect(200);
    state.actor = {
      ...state.actor,
      permissions: [
        PERMISSIONS.APARTMENTS_CREATE,
        PERMISSIONS.CUSTOMERS_CREATE,
      ],
    };
    await request(server())
      .post(IMPORT_ENDPOINT)
      .auth(TOKEN, { type: 'bearer' })
      .expect(403);
    expect(imports.import).toHaveBeenCalledTimes(1);
    expect(authenticate).toHaveBeenCalledTimes(3);
  });
});
