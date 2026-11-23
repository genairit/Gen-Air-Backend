import {
  Get,
  Param,
  Controller,
  HttpException,
  INestApplication,
} from '@nestjs/common';

import request from 'supertest';
import { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import { HttpAdapterHost } from '@nestjs/core';
import { GeneralFilter } from './http-error.filter';
import { DRIVE_FOLDER_LINK_ERROR_CODES } from '@Modules/project-drive-link/constants/drive-folder-link.constant';

@Controller('public-error-contract')
class ErrorContractController {
  @Get(':code/:status')
  fail(@Param('code') code: string, @Param('status') status: string): never {
    throw new HttpException(
      { code, message: 'הודעה ציבורית', privateDetails: 'hidden' },
      Number(status),
    );
  }
}

describe('GeneralFilter public Drive error HTTP contract', () => {
  const state: { app: INestApplication<Server> | null } = { app: null };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ErrorContractController],
    }).compile();
    state.app = module.createNestApplication<INestApplication<Server>>();
    state.app.useGlobalFilters(new GeneralFilter(module.get(HttpAdapterHost)));
    await state.app.init();
  });
  afterAll(async () => state.app?.close());
  const server = (): Server => {
    if (!state.app) throw new Error('Application not initialized');
    return state.app.getHttpServer();
  };
  it.each(Object.values(DRIVE_FOLDER_LINK_ERROR_CODES))(
    'preserves stable Drive code %s in actual HTTP responses',
    async (code) => {
      const response = await request(server())
        .get(`/public-error-contract/${code}/409`)
        .expect(409);
      expect(response.body).toEqual({
        statusCode: 409,
        code,
        message: 'הודעה ציבורית',
      });
    },
  );
  it.each(['23505', 'GoogleSdkPrivateError', 'DRIVE_FOLDER_UNREGISTERED'])(
    'hides unapproved code %s and private fields',
    async (code) => {
      const response = await request(server())
        .get(`/public-error-contract/${code}/400`)
        .expect(400);
      expect(response.body).toEqual({
        statusCode: 400,
        message: 'הודעה ציבורית',
      });
    },
  );
});
