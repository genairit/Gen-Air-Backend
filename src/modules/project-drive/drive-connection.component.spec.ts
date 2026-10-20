import {
  ValidationPipe,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';

import request from 'supertest';
import { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from '@Guards/auth.guard';
import { AuthService } from '@Modules/auth/auth.service';
import { ProjectDriveService } from './project-drive.service';
import { ProjectDriveController } from './project-drive.controller';
import { driveConnectionResult } from '@Providers/google-drive/utilities/drive-connection.utility';
import { DRIVE_CONNECTION_STATUS } from '@Providers/google-drive/constants/drive-connection.constant';

describe('Drive connection access', () => {
  const application: { app: INestApplication<Server> | null } = { app: null };
  const checkConnection = jest
    .fn()
    .mockResolvedValue(
      driveConnectionResult(DRIVE_CONNECTION_STATUS.NOT_CONFIGURED),
    );
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ProjectDriveController],
      providers: [
        { provide: ProjectDriveService, useValue: { checkConnection } },
        {
          provide: AuthService,
          useValue: {
            authenticate: (token: string) => {
              const roles: Record<string, string> = {
                admin: 'system_admin',
                manager: 'project_manager',
                employee: 'installer',
              };
              if (!(token in roles)) {
                throw new UnauthorizedException();
              }

              return Promise.resolve({ id: token, role: roles[token] });
            },
          },
        },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    }).compile();
    application.app = module.createNestApplication<INestApplication<Server>>();
    application.app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await application.app.init();
  });
  beforeEach(() => checkConnection.mockClear());
  afterAll(async () => application.app?.close());
  it('requires authentication', async () => {
    await request(application.app!.getHttpServer())
      .get('/project-drive/connection')
      .expect(401);
    expect(checkConnection).not.toHaveBeenCalled();
  });
  it.each(['manager', 'employee'])(
    'rejects %s before touching Google',
    async (token) => {
      await request(application.app!.getHttpServer())
        .get('/project-drive/connection')
        .auth(token, { type: 'bearer' })
        .expect(403);
      expect(checkConnection).not.toHaveBeenCalled();
    },
  );
  it('routes the administrator check without treating connection as a project UUID', async () => {
    const result = await request(application.app!.getHttpServer())
      .get('/project-drive/connection')
      .auth('admin', { type: 'bearer' })
      .expect(200);
    expect(result.body).toMatchObject({
      status: 'not_configured',
      ready: false,
      writesTested: false,
    });
    expect(checkConnection).toHaveBeenCalledTimes(1);
  });
});
