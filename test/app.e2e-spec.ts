import request from 'supertest';
import { App } from 'supertest/types';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from '@Guards/auth.guard';
import { TIME_UNITS } from '@Constants/time.constant';
import { AuthService } from '@Modules/auth/auth.service';
import { COOKIE_KEYS } from '@Constants/storage.constant';
import { AuthController } from '@Modules/auth/auth.controller';
import { INestApplication, ValidationPipe } from '@nestjs/common';

describe('Auth HTTP boundary (e2e)', () => {
  const previousClientSecret = process.env.AUTH_CLIENT_SECRET ?? null;
  const state: { app: INestApplication<App> | null } = { app: null };
  const login = jest.fn().mockResolvedValue({
    user: { id: 'employee-id' },
    accessToken: 'test-access-token',
  });
  const server = () => {
    if (!state.app) {
      throw new Error('Auth test application is unavailable');
    }
    return state.app.getHttpServer();
  };
  const credentials = {
    email: 'employee@example.invalid',
    password: 'test-password',
  };

  beforeAll(async () => {
    process.env.AUTH_CLIENT_SECRET =
      'auth-e2e-test-secret-at-least-32-characters';
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { login } },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    }).compile();
    state.app = module.createNestApplication<INestApplication<App>>();
    state.app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await state.app.init();
  });

  beforeEach(() => jest.clearAllMocks());

  afterAll(async () => {
    await state.app?.close();
    if (previousClientSecret === null) {
      delete process.env.AUTH_CLIENT_SECRET;
    } else {
      process.env.AUTH_CLIENT_SECRET = previousClientSecret;
    }
  });

  it('accepts a valid public login and issues a protected caller cookie', async () => {
    const response = await request(server())
      .post('/auth/login')
      .send(credentials)
      .expect(200);

    expect(response.body).toEqual({
      user: { id: 'employee-id' },
      accessToken: 'test-access-token',
    });
    const cookieLifetimeSeconds = TIME_UNITS.DAY_MS / TIME_UNITS.SECOND_MS;
    expect(response.headers['set-cookie']?.[0]).toMatch(
      new RegExp(
        `^${COOKIE_KEYS.ANONYMOUS_CLIENT}=[0-9a-f]{32}\\.[0-9a-f]{64}; Path=/; Max-Age=${cookieLifetimeSeconds}; HttpOnly; Secure; SameSite=Strict$`,
      ),
    );
    expect(login).toHaveBeenCalledWith(credentials, expect.any(String));
  });

  it('reuses a valid signed caller cookie across login requests', async () => {
    const first = await request(server())
      .post('/auth/login')
      .send(credentials)
      .expect(200);
    const setCookieHeaders: unknown = first.headers['set-cookie'];
    if (!Array.isArray(setCookieHeaders)) {
      throw new Error('Login did not issue a caller cookie');
    }
    const setCookie: unknown = setCookieHeaders[0];
    if (typeof setCookie !== 'string') {
      throw new Error('Login did not provide a valid caller identity');
    }
    const cookie = setCookie.split(';')[0];
    const firstClientId = cookie.split('=')[1]?.split('.')[0];
    if (!firstClientId) {
      throw new Error('Caller cookie is missing its identity');
    }

    const second = await request(server())
      .post('/auth/login')
      .set('Cookie', cookie)
      .send(credentials)
      .expect(200);

    expect(second.headers['set-cookie']).toBeUndefined();
    expect(login).toHaveBeenNthCalledWith(1, credentials, firstClientId);
    expect(login).toHaveBeenNthCalledWith(2, credentials, firstClientId);
  });

  it('rejects an invalid login body before calling the auth service', async () => {
    await request(server())
      .post('/auth/login')
      .send({ ...credentials, email: 'not-an-email' })
      .expect(400);
    expect(login).not.toHaveBeenCalled();
  });

  it('requires a bearer token for the protected role endpoint', async () => {
    await request(server())
      .patch('/auth/role')
      .send({ role: 'engineer' })
      .expect(401);
  });
});
