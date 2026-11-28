import 'reflect-metadata';
import request from 'supertest';
import { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { mock } from 'jest-mock-extended';
import { AuthGuard } from '@Guards/auth.guard';
import { AuthService } from '@Modules/auth/auth.service';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { EstimateExportService } from './estimate-export.service';
import { authorizedUser } from '../../testing/authorization.fixture';
import { EstimateApprovalService } from './estimate-approval.service';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { EngineeringEstimateService } from './engineering-estimate.service';
import { EngineeringEstimateController } from './engineering-estimate.controller';

describe('Estimate preview HTTP boundary', (): void => {
  const estimates = mock<EngineeringEstimateService>();
  const state: {
    app: INestApplication<Server> | null;
    permissions: (
      | typeof PERMISSIONS.ENGINEERING_ESTIMATES_READ
      | typeof PERMISSIONS.ENGINEERING_ESTIMATES_MANAGE
    )[];
  } = { app: null, permissions: [] };
  const server = (): Server => {
    if (!state.app) {
      throw new Error('Test application has not started');
    }
    return state.app.getHttpServer();
  };

  beforeAll(async (): Promise<void> => {
    const module = await Test.createTestingModule({
      controllers: [EngineeringEstimateController],
      providers: [
        { provide: EngineeringEstimateService, useValue: estimates },
        {
          provide: EstimateApprovalService,
          useValue: mock<EstimateApprovalService>(),
        },
        {
          provide: EstimateExportService,
          useValue: mock<EstimateExportService>(),
        },
        {
          provide: AuthService,
          useValue: {
            authenticate: (): Promise<ReturnType<typeof authorizedUser>> =>
              Promise.resolve(authorizedUser(state.permissions)),
          },
        },
        { provide: APP_GUARD, useClass: AuthGuard },
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

  afterAll(async (): Promise<void> => {
    await state.app?.close();
  });

  it('requires authentication and both estimate permissions', async (): Promise<void> => {
    await request(server())
      .post('/engineering-estimates/preview')
      .send({ scope: 'hvac', areas: [] })
      .expect(401);
    state.permissions = [PERMISSIONS.ENGINEERING_ESTIMATES_READ];
    await request(server())
      .post('/engineering-estimates/preview')
      .auth('valid', { type: 'bearer' })
      .send({ scope: 'hvac', areas: [] })
      .expect(403);
  });

  it('validates the request and returns calculation without requiring an estimate ID', async (): Promise<void> => {
    state.permissions = [
      PERMISSIONS.ENGINEERING_ESTIMATES_READ,
      PERMISSIONS.ENGINEERING_ESTIMATES_MANAGE,
    ];
    estimates.preview.mockResolvedValue({ lines: [], subtotal: '0.00' });
    await request(server())
      .post('/engineering-estimates/preview')
      .auth('valid', { type: 'bearer' })
      .send({ scope: 'hvac', areas: [[]] })
      .expect(400);
    await request(server())
      .post('/engineering-estimates/preview')
      .auth('valid', { type: 'bearer' })
      .send({ scope: 'hvac', areas: [] })
      .expect(200)
      .expect({ lines: [], subtotal: '0.00' });
    expect(estimates.preview.mock.calls).toEqual([
      [{ scope: 'hvac', areas: [] }],
    ]);
  });
});
