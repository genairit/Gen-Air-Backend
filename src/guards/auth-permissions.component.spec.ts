import {
  Get,
  Req,
  Controller,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';

import request from 'supertest';
import { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth.guard';
import { Public } from '@Decorators/public.decorator';
import { AuthService } from '@Modules/auth/auth.service';
import { METADATA_KEYS } from '@Constants/metadata-keys';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { authorizedUser } from '../testing/authorization.fixture';
import { Authenticated } from '@Decorators/authenticated.decorator';
import type { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import { RequirePermissions } from '@Decorators/require-permissions.decorator';
import type { IAuthenticatedRequest } from '@Interfaces/authenticated-request.interface';

interface IGuardTestState {
  actor: IAuthorizedUser;
  app: INestApplication<Server> | null;
}

@Controller('permission-test')
class PermissionTestController {
  @Public()
  @Get('public')
  publicRead(): string {
    return 'public';
  }

  @Authenticated()
  @Get('me')
  me(@Req() req: IAuthenticatedRequest): IAuthorizedUser {
    return req.user;
  }

  @RequirePermissions(PERMISSIONS.PROJECTS_CREATE, PERMISSIONS.TASKS_ASSIGN)
  @Get('all')
  all(): string {
    return 'allowed';
  }

  @RequirePermissions()
  @Get('empty')
  empty(): string {
    return 'must not allow';
  }

  @Get('unannotated')
  unannotated(): string {
    return 'must not allow';
  }

  @Get('unknown')
  unknown(this: void): string {
    return 'must not allow';
  }
}

Reflect.defineMetadata(
  METADATA_KEYS.PERMISSIONS,
  ['unregistered.grant'],
  PermissionTestController.prototype.unknown,
);

describe('Feature permission HTTP boundary', () => {
  const state: IGuardTestState = { actor: authorizedUser(), app: null };
  const authenticate = jest.fn((token: string): Promise<IAuthorizedUser> => {
    if (token !== 'valid') {
      throw new UnauthorizedException('Invalid test token');
    }

    return Promise.resolve(state.actor);
  });
  const server = (): Server => {
    if (!state.app) {
      throw new Error('Test application has not started');
    }

    return state.app.getHttpServer();
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PermissionTestController],
      providers: [
        { provide: AuthService, useValue: { authenticate } },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    }).compile();
    state.app = module.createNestApplication<INestApplication<Server>>();
    await state.app.init();
  });

  beforeEach(() => {
    state.actor = authorizedUser();
    authenticate.mockClear();
  });

  afterAll(async () => state.app?.close());

  it('permits a public route without authenticating', async () => {
    await request(server()).get('/permission-test/public').expect(200);

    expect(authenticate).not.toHaveBeenCalled();
  });

  it.each(['', 'Basic valid', 'Bearer bad'])(
    'rejects missing or invalid bearer credentials: %s',
    async (header) => {
      await request(server())
        .get('/permission-test/me')
        .set('Authorization', header)
        .expect(401);
    },
  );

  it('allows explicitly authenticated identity retrieval without feature grants', async () => {
    const response = await request(server())
      .get('/permission-test/me')
      .auth('valid', { type: 'bearer' })
      .expect(200);

    expect(response.body).toMatchObject({
      id: state.actor.id,
      permissions: [],
    });
  });

  it('requires every declared permission, not any one grant', async () => {
    state.actor = authorizedUser([PERMISSIONS.PROJECTS_CREATE]);
    await request(server())
      .get('/permission-test/all')
      .auth('valid', { type: 'bearer' })
      .expect(403);
    state.actor = authorizedUser([
      PERMISSIONS.PROJECTS_CREATE,
      PERMISSIONS.TASKS_ASSIGN,
    ]);
    await request(server())
      .get('/permission-test/all')
      .auth('valid', { type: 'bearer' })
      .expect(200);
  });

  it('does not grant features from an administrator role alone', async () => {
    await request(server())
      .get('/permission-test/all')
      .auth('valid', { type: 'bearer' })
      .expect(403);
  });

  it.each(['empty', 'unknown', 'unannotated'])(
    'fails closed on %s route metadata',
    async (route) => {
      state.actor = authorizedUser(Object.values(PERMISSIONS));

      await request(server())
        .get(`/permission-test/${route}`)
        .auth('valid', { type: 'bearer' })
        .expect(403);
    },
  );

  it('applies revocation to the next request with the same token', async () => {
    state.actor = authorizedUser([
      PERMISSIONS.PROJECTS_CREATE,
      PERMISSIONS.TASKS_ASSIGN,
    ]);
    await request(server())
      .get('/permission-test/all')
      .auth('valid', { type: 'bearer' })
      .expect(200);
    state.actor = authorizedUser();
    await request(server())
      .get('/permission-test/all')
      .auth('valid', { type: 'bearer' })
      .expect(403);

    expect(authenticate).toHaveBeenCalledTimes(2);
  });
});
