import { test } from 'node:test';
import { Readable } from 'node:stream';
import assert from 'node:assert/strict';
import { createHandler, readBackendUrl } from '../server.js';

const CLIENT_SECRET = 'questionnaire-test-secret-at-least-32-chars';
const createTestHandler = (options) =>
  createHandler({ clientSecret: CLIENT_SECRET, ...options });

const invoke = async (
  handler,
  { path = '/', method = 'GET', body = '', headers = {} } = {},
) => {
  const request = Readable.from(body ? [Buffer.from(body)] : []);
  Object.assign(request, {
    url: path,
    method,
    headers,
    socket: { remoteAddress: '127.0.0.1' },
  });
  const state = {};
  const response = {
    setHeader: (name, value) => {
      state.headers ??= {};
      state.headers[name] = value;
    },
    writeHead: (status, headers) =>
      Object.assign(state, {
        status,
        headers: { ...state.headers, ...headers },
      }),
    end: (body) => {
      state.body = body.toString();
    },
  };
  await handler(request, response);
  return state;
};

test('serves branded HTML with strict CSP and no-store', async () => {
  const result = await invoke(
    createTestHandler({ backendUrl: 'https://backend.example' }),
  );
  assert.equal(result.status, 200);
  assert.match(result.body, /dir="rtl"/);
  assert.match(result.headers['Content-Security-Policy'], /connect-src 'self'/);
  assert.equal(result.headers['Cache-Control'], 'no-store');
});

test('proxies only exact permitted routes without credentials or user-selected destinations', async () => {
  const calls = [];
  const handler = createTestHandler({
    backendUrl: 'https://backend.example',
    fetcher: async (...args) => {
      calls.push(args);
      return new Response('{"ok":true}');
    },
  });
  for (const path of [
    '/customer',
    '/questionnaire-submission?id=1',
    '/questionnaire/genair-workflow?url=https://evil.example',
    '/questionnaire-submission/123',
  ]) {
    assert.equal((await invoke(handler, { path })).status, 404);
  }
  assert.equal(calls.length, 0);
  await invoke(handler, {
    path: '/questionnaire/genair-workflow',
    headers: { authorization: 'Bearer secret', cookie: 'session=secret' },
  });
  assert.equal(
    calls[0][0],
    'https://backend.example/questionnaire/genair-workflow',
  );
  assert.equal(calls[0][1].headers['Content-Type'], 'application/json');
  assert.match(
    calls[0][1].headers.Cookie,
    /^genair_anonymous_client=[0-9a-f]{32}\.[0-9a-f]{64}$/,
  );
  assert.equal(calls[0][1].headers.Cookie.includes('session=secret'), false);
  assert.equal(calls[0][1].redirect, 'error');
});

test('rejects oversized and non-JSON requests before proxying', async () => {
  const handler = createTestHandler({
    backendUrl: 'http://backend.example',
    fetcher: () => {
      throw new Error('must not proxy');
    },
  });
  assert.equal(
    (
      await invoke(handler, {
        path: '/questionnaire-submission',
        method: 'POST',
      })
    ).status,
    415,
  );
  assert.equal(
    (
      await invoke(handler, {
        path: '/questionnaire-submission',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'x'.repeat(65537),
      })
    ).status,
    413,
  );
});

test('returns retryable errors and isolates callers on a shared peer address', async (context) => {
  const log = context.mock.method(console, 'error', () => {});
  const handler = createTestHandler({
    backendUrl: 'http://backend.example',
    now: () => 1,
    fetcher: async () => {
      throw new Error('network failure');
    },
  });
  const first = await invoke(handler, {
    path: '/questionnaire/genair-workflow',
  });
  const cookie = first.headers['Set-Cookie'].split(';')[0];
  const results = await Promise.all(
    Array.from({ length: 120 }, () =>
      invoke(handler, {
        path: '/questionnaire/genair-workflow',
        headers: { cookie },
      }),
    ),
  );
  assert.equal(results.filter((result) => result.status === 502).length, 119);
  assert.equal(results[119].status, 429);
  const other = await invoke(handler, {
    path: '/questionnaire/genair-workflow',
  });
  assert.equal(other.status, 502);
  assert.equal(log.mock.callCount(), 121);
  assert.deepEqual(log.mock.calls[0].arguments, [
    'Questionnaire backend request failed',
  ]);
});

test('rejects a forged caller cookie and issues a secure replacement', async () => {
  const result = await invoke(
    createTestHandler({
      backendUrl: 'https://backend.example',
      fetcher: async () => new Response('{}'),
    }),
    {
      path: '/questionnaire/genair-workflow',
      headers: { cookie: 'genair_anonymous_client=' + 'a'.repeat(97) },
    },
  );
  assert.equal(result.status, 200);
  assert.match(
    result.headers['Set-Cookie'],
    /HttpOnly; Secure; SameSite=Strict/,
  );
});

test('rejects backend credentials, query, paths and unsupported protocols', () => {
  for (const value of [
    'file:///tmp/test',
    'https://user:pass@backend.example',
    'https://backend.example/path',
    'https://backend.example?url=x',
  ]) {
    assert.throws(() => readBackendUrl(value));
  }
});
