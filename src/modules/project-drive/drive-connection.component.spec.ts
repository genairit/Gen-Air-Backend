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
  const moveFile = jest.fn(async (): Promise<void> => {});
  const trashFile = jest.fn(async (): Promise<void> => {});
  const projectId = '92710bd0-68c9-4e20-a4e2-ef75e519f6ce';
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ProjectDriveController],
      providers: [
        {
          provide: ProjectDriveService,
          useValue: { checkConnection, provision, moveFile, trashFile },
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
    moveFile.mockClear();
    trashFile.mockClear();
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

  describe.each(['patch', 'delete'] as const)(
    '%s file management access',
    (method) => {
      const fileId = 'drive-file_123';
      const route = `/project-drive/${projectId}/files/${fileId}`;
      const mutation = () => (method === 'patch' ? moveFile : trashFile);

      it('requires authentication before invoking the service', async () => {
        await request(application.app!.getHttpServer())
          [method](route)
          .send({})
          .expect(401);
        expect(mutation()).not.toHaveBeenCalled();
      });

      it.each(['employee', 'engineer'])(
        'rejects %s before invoking the service',
        async (token) => {
          await request(application.app!.getHttpServer())
            [method](route)
            .auth(token, { type: 'bearer' })
            .send({})
            .expect(403);
          expect(mutation()).not.toHaveBeenCalled();
        },
      );

      it.each(['admin', 'manager', 'secretary'])(
        'allows the project editor %s and returns an empty 204 response',
        async (token) => {
          const response = await request(application.app!.getHttpServer())
            [method](route)
            .auth(token, { type: 'bearer' })
            .send({})
            .expect(204);
          expect(response.text).toBe('');
          if (method === 'patch') {
            expect(moveFile).toHaveBeenCalledWith(projectId, fileId, {});
            return;
          }
          expect(trashFile).toHaveBeenCalledWith(projectId, fileId);
        },
      );

      it.each([
        ['/project-drive/invalid-project/files/drive-file', 'project UUID'],
        [`/project-drive/${projectId}/files/unsafe%27file`, 'Drive file id'],
        [
          `/project-drive/${projectId}/files/unsafe%2Cfile`,
          'Drive file id comma',
        ],
      ])('rejects malformed route %s (%s)', async (invalidRoute) => {
        await request(application.app!.getHttpServer())
          [method](invalidRoute)
          .auth('admin', { type: 'bearer' })
          .send({})
          .expect(400);
        expect(mutation()).not.toHaveBeenCalled();
      });
    },
  );

  it('passes the requested destination folder to the move service', async () => {
    await request(application.app!.getHttpServer())
      .patch(`/project-drive/${projectId}/files/drive-file`)
      .auth('manager', { type: 'bearer' })
      .send({ folderId: 'destination-folder' })
      .expect(204);
    expect(moveFile).toHaveBeenCalledWith(projectId, 'drive-file', {
      folderId: 'destination-folder',
    });
  });

  it.each(['', 'unsafe,folder', "unsafe'folder", '../foreign', 42])(
    'rejects an unsafe move destination %s',
    async (folderId) => {
      await request(application.app!.getHttpServer())
        .patch(`/project-drive/${projectId}/files/drive-file`)
        .auth('admin', { type: 'bearer' })
        .send({ folderId })
        .expect(400);
      expect(moveFile).not.toHaveBeenCalled();
    },
  );

  it('accepts a null optional move destination as the project root', async () => {
    await request(application.app!.getHttpServer())
      .patch(`/project-drive/${projectId}/files/drive-file`)
      .auth('admin', { type: 'bearer' })
      .send({ folderId: null })
      .expect(204);
    expect(moveFile).toHaveBeenCalledWith(projectId, 'drive-file', {
      folderId: null,
    });
  });
});
