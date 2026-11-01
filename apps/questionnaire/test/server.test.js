import { test } from 'node:test';
import { Readable } from 'node:stream';
import assert from 'node:assert/strict';
import { createHandler, readBackendUrl } from '../server.js';

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
    writeHead: (status, headers) => Object.assign(state, { status, headers }),
    end: (body) => {
      state.body = body.toString();
    },
  };
  await handler(request, response);
  return state;
};

test('serves branded HTML with strict CSP and no-store', async () => {
  const result = await invoke(
    createHandler({ backendUrl: 'https://backend.example' }),
  );
  assert.equal(result.status, 200);
  assert.match(result.body, /dir="rtl"/);
  assert.match(result.headers['Content-Security-Policy'], /connect-src 'self'/);
  assert.equal(result.headers['Cache-Control'], 'no-store');
});

test('proxies only exact permitted routes without credentials or user-selected destinations', async () => {
  const calls = [];
  const handler = createHandler({
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
  assert.deepEqual(calls[0][1].headers, { 'Content-Type': 'application/json' });
  assert.equal(calls[0][1].redirect, 'error');
});

test('rejects oversized and non-JSON requests before proxying', async () => {
  const handler = createHandler({
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

test('returns retryable errors and applies bounded peer limiter', async (context) => {
  const log = context.mock.method(console, 'error', () => {});
  const handler = createHandler({
    backendUrl: 'http://backend.example',
    now: () => 1,
    fetcher: async () => {
      throw new Error('network failure');
    },
  });
  const results = await Promise.all(
    Array.from({ length: 121 }, () =>
      invoke(handler, { path: '/questionnaire/genair-workflow' }),
    ),
  );
  assert.equal(results.filter((result) => result.status === 502).length, 120);
  assert.equal(results[120].status, 429);
  assert.equal(log.mock.callCount(), 120);
  assert.deepEqual(log.mock.calls[0].arguments, [
    'Questionnaire backend request failed',
  ]);
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
