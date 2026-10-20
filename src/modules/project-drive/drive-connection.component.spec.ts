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
  const provision = jest.fn().mockResolvedValue({ id: 'project' });
  const projectId = '92710bd0-68c9-4e20-a4e2-ef75e519f6ce';
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ProjectDriveController],
      providers: [
        {
          provide: ProjectDriveService,
          useValue: { checkConnection, provision },
        },
        {
          provide: AuthService,
          useValue: {
            authenticate: (token: string) => {
              const roles: Record<string, string> = {
                admin: 'system_admin',
                manager: 'project_manager',
                employee: 'installer',
                engineer: 'engineer',
                secretary: 'secretary',
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
  beforeEach(() => {
    checkConnection.mockClear();
    provision.mockClear();
  });
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
  it('requires authentication to provision a project', async () => {
    await request(application.app!.getHttpServer())
      .post(`/project-drive/${projectId}/provision`)
      .expect(401);
    expect(provision).not.toHaveBeenCalled();
  });
  it.each(['employee', 'engineer'])(
    'rejects provisioning by %s before touching Drive',
    async (token) => {
      await request(application.app!.getHttpServer())
        .post(`/project-drive/${projectId}/provision`)
        .auth(token, { type: 'bearer' })
        .expect(403);
      expect(provision).not.toHaveBeenCalled();
    },
  );
  it.each(['admin', 'manager', 'secretary'])(
    'allows provisioning by project editor %s',
    async (token) => {
      await request(application.app!.getHttpServer())
        .post(`/project-drive/${projectId}/provision`)
        .auth(token, { type: 'bearer' })
        .expect(201);
      expect(provision).toHaveBeenCalledWith(projectId);
      expect(provision).toHaveBeenCalledTimes(1);
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
