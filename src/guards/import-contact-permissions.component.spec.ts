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
import { CustomerContactService } from '@Modules/customer-contact/customer-contact.service';
import { CustomerContactController } from '@Modules/customer-contact/customer-contact.controller';
import { ProjectApartmentImportService } from '@Modules/project/project-apartment-import.service';
import { ProjectApartmentImportController } from '@Modules/project/project-apartment-import.controller';

const REQUIRED_IMPORT_PERMISSIONS = [
  PERMISSIONS.APARTMENTS_CREATE,
  PERMISSIONS.CUSTOMERS_CREATE,
  PERMISSIONS.CUSTOMERS_UPDATE,
];
const SCOPE_ID = '11111111-1111-4111-8111-111111111111';
const IMPORT_ENDPOINT = `/project/${SCOPE_ID}/apartments/import`;
const CONTACT_ENDPOINT = `/customer/${SCOPE_ID}/contacts`;
const TOKEN = 'unchanged-token';
interface IPermissionState {
  actor: IAuthorizedUser;
  app: INestApplication<Server> | null;
}

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
  const contacts = {
    list: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: SCOPE_ID }),
    update: jest.fn().mockResolvedValue({ id: SCOPE_ID }),
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
      controllers: [
        ProjectApartmentImportController,
        CustomerContactController,
      ],
      providers: [
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: AuthService, useValue: { authenticate } },
        { provide: ProjectApartmentImportService, useValue: imports },
        { provide: CustomerContactService, useValue: contacts },
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

  it('does not infer any import or contact privilege from the admin role', async () => {
    await request(server())
      .post(IMPORT_ENDPOINT)
      .auth(TOKEN, { type: 'bearer' })
      .expect(403);
    await request(server())
      .get(CONTACT_ENDPOINT)
      .auth(TOKEN, { type: 'bearer' })
      .expect(403);
    await request(server())
      .post(CONTACT_ENDPOINT)
      .auth(TOKEN, { type: 'bearer' })
      .expect(403);
    await request(server())
      .patch(`${CONTACT_ENDPOINT}/${SCOPE_ID}`)
      .auth(TOKEN, { type: 'bearer' })
      .expect(403);
    expect(contacts.create).not.toHaveBeenCalled();
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

  it('separates contact reads from writes and observes grant changes on each request', async () => {
    setPermissions([PERMISSIONS.CUSTOMERS_READ]);
    await request(server())
      .get(CONTACT_ENDPOINT)
      .auth(TOKEN, { type: 'bearer' })
      .expect(200);
    await request(server())
      .post(CONTACT_ENDPOINT)
      .auth(TOKEN, { type: 'bearer' })
      .expect(403);
    setPermissions([PERMISSIONS.CUSTOMERS_UPDATE]);
    await request(server())
      .post(CONTACT_ENDPOINT)
      .auth(TOKEN, { type: 'bearer' })
      .send({ name: 'Test contact' })
      .expect(201);
    await request(server())
      .patch(`${CONTACT_ENDPOINT}/${SCOPE_ID}`)
      .auth(TOKEN, { type: 'bearer' })
      .send({ name: 'Changed contact' })
      .expect(200);
    await request(server())
      .get(CONTACT_ENDPOINT)
      .auth(TOKEN, { type: 'bearer' })
      .expect(403);
    setPermissions([]);
    await request(server())
      .post(CONTACT_ENDPOINT)
      .auth(TOKEN, { type: 'bearer' })
      .expect(403);
    expect(contacts.create).toHaveBeenCalledTimes(1);
    expect(contacts.update).toHaveBeenCalledTimes(1);
  });
});
