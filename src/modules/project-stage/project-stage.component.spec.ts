import request from 'supertest';
import { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from '@Guards/auth.guard';
import { INestApplication } from '@nestjs/common';
import { AuthService } from '@Modules/auth/auth.service';
import { ProjectStageService } from './project-stage.service';
import { ProjectStageController } from './project-stage.controller';
import { ProjectStageRepository } from './project-stage.repository';
import { FIXED_PROJECT_STATUSES } from '@Constants/project-status.constant';

const STAGES = FIXED_PROJECT_STATUSES.map((stage) => ({
  ...stage,
  tag: null,
  color: null,
  description: null,
}));
describe('Read-only project status API', () => {
  const application: { app: INestApplication<Server> | null } = { app: null };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ProjectStageController],
      providers: [
        ProjectStageService,
        {
          provide: ProjectStageRepository,
          useValue: { findAll: () => Promise.resolve(STAGES) },
        },
        {
          provide: AuthService,
          useValue: {
            authenticate: () =>
              Promise.resolve({ id: 'admin', role: 'system_admin' }),
          },
        },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    }).compile();
    application.app = module.createNestApplication<INestApplication<Server>>();
    await application.app.init();
  });
  afterAll(async () => application.app?.close());
  it('keeps catalog reads authenticated', async () => {
    await request(application.app!.getHttpServer())
      .get('/project-stage')
      .expect(401);
  });
  it('returns the fixed database catalog', async () => {
    const response = await request(application.app!.getHttpServer())
      .get('/project-stage')
      .auth('admin', { type: 'bearer' })
      .expect(200);
    expect(response.body).toEqual(STAGES);
  });
  it('does not expose definition mutations even to an administrator', async () => {
    const server = application.app!.getHttpServer();
    await request(server)
      .post('/project-stage')
      .auth('admin', { type: 'bearer' })
      .send({ name: 'custom' })
      .expect(404);
    await request(server)
      .patch(`/project-stage/${STAGES[0].id}`)
      .auth('admin', { type: 'bearer' })
      .send({ name: 'changed' })
      .expect(404);
    await request(server)
      .put('/project-stage/order')
      .auth('admin', { type: 'bearer' })
      .send({ stageIds: [] })
      .expect(404);
    await request(server)
      .delete(`/project-stage/${STAGES[0].id}`)
      .auth('admin', { type: 'bearer' })
      .expect(404);
  });
});
