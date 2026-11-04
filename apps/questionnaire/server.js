import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { TIME_LIMITS, TIME_UNITS } from './public/constants/time.js';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { QUESTIONNAIRE_LIMITS } from './public/constants/questionnaire.js';
import STORAGE_KEYS from './public/constants/storage-keys.json' with { type: 'json' };

const LIMITS = {
  BODY_BYTES: QUESTIONNAIRE_LIMITS.BODY_BYTES,
  MINUTE_MS: TIME_LIMITS.MINUTE_MS,
  REQUESTS: 120,
  TOTAL_REQUESTS: 5000,
  CLIENTS: 10000,
  TIMEOUT_MS: TIME_LIMITS.API_TIMEOUT_MS,
};
const CLIENT_COOKIE = STORAGE_KEYS.ANONYMOUS_CLIENT_COOKIE;
const CLIENT_PATTERN = /^([0-9a-f]{32})\.([0-9a-f]{64})$/;

const signClient = (clientId, secret) =>
  `${clientId}.${createHmac('sha256', secret).update(clientId).digest('hex')}`;

const readClientToken = (header) =>
  header
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${CLIENT_COOKIE}=`))
    ?.slice(CLIENT_COOKIE.length + 1);

const verifyClient = (token, secret) => {
  const match = token?.match(CLIENT_PATTERN);
  if (!match) {
    return null;
  }

  const [, clientId, signature] = match;
  const expected = createHmac('sha256', secret).update(clientId).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'))
    ? clientId
    : null;
};
const STATIC_FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/submission.js': ['submission.js', 'text/javascript; charset=utf-8'],
};
for (const name of ['storage', 'time', 'questionnaire']) {
  STATIC_FILES[`/constants/${name}.js`] = [
    `constants/${name}.js`,
    'text/javascript; charset=utf-8',
  ];
}

const API_ROUTES = {
  'GET /questionnaire/genair-workflow': '/questionnaire/genair-workflow',
  'POST /questionnaire-submission': '/questionnaire-submission',
};
const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};

export const readBackendUrl = (raw) => {
  const url = new URL(raw);
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error(
      'BACKEND_URL must be an HTTP(S) origin without credentials, path, query or fragment',
    );
  }
  return url.origin;
};

const respond = (
  response,
  status,
  body,
  contentType = 'application/json; charset=utf-8',
) => {
  response.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': contentType,
  });
  response.end(body);
};

const readBody = async (request) => {
  const chunks = [];
  const state = { size: 0 };
  for await (const chunk of request) {
    state.size += chunk.length;
    if (state.size > LIMITS.BODY_BYTES) {
      throw new Error('BODY_TOO_LARGE');
    }

    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

export const createHandler = ({
  backendUrl,
  clientSecret = process.env.QUESTIONNAIRE_CLIENT_SECRET,
  fetcher = fetch,
  now = Date.now,
}) => {
  const origin = readBackendUrl(backendUrl);
  if (typeof clientSecret !== 'string' || clientSecret.length < 32) {
    throw new Error(
      'QUESTIONNAIRE_CLIENT_SECRET must contain at least 32 characters',
    );
  }
  const clients = new Map();
  const total = { count: 0, expires: 0 };
  const limited = (clientId) => {
    const timestamp = now();
    if (timestamp >= total.expires) {
      Object.assign(total, { count: 0, expires: timestamp + LIMITS.MINUTE_MS });
    }
    total.count += 1;
    if (total.count > LIMITS.TOTAL_REQUESTS) {
      return true;
    }
    for (const [key, value] of clients) {
      if (timestamp >= value.expires) {
        clients.delete(key);
      }
    }
    const current = clients.get(clientId);
    if (current) {
      current.count += 1;
      return current.count > LIMITS.REQUESTS;
    }
    if (clients.size >= LIMITS.CLIENTS) {
      clients.delete(clients.keys().next().value);
    }

    clients.set(clientId, { count: 1, expires: timestamp + LIMITS.MINUTE_MS });
    return false;
  };

  return async (request, response) => {
    const supplied = readClientToken(request.headers.cookie);
    const clientId = verifyClient(supplied, clientSecret);
    const token = clientId
      ? supplied
      : signClient(randomBytes(16).toString('hex'), clientSecret);
    if (!clientId) {
      response.setHeader(
        'Set-Cookie',
        `${CLIENT_COOKIE}=${token}; Path=/; Max-Age=${TIME_LIMITS.DAY_MS / TIME_UNITS.SECOND_MS}; HttpOnly; Secure; SameSite=Strict`,
      );
    }
    const route = `${request.method} ${request.url}`;
    const staticFile =
      request.method === 'GET' ? STATIC_FILES[request.url] : null;
    if (staticFile) {
      const content = await readFile(
        new URL(`./public/${staticFile[0]}`, import.meta.url),
      );
      respond(response, 200, content, staticFile[1]);
      return;
    }
    if (route === 'GET /health') {
      respond(response, 200, '{"status":"ok"}');
      return;
    }
    const path = API_ROUTES[route];
    if (!path) {
      respond(response, 404, '{"message":"Not found"}');
      return;
    }
    if (limited(clientId ?? token.slice(0, 32))) {
      respond(response, 429, '{"message":"Too many requests"}');
      return;
    }
    const hasBody = request.method === 'POST';
    if (
      hasBody &&
      request.headers['content-type']?.split(';')[0] !== 'application/json'
    ) {
      respond(response, 415, '{"message":"JSON required"}');
      return;
    }
    try {
      const body = hasBody ? await readBody(request) : null;
      const upstream = await fetcher(`${origin}${path}`, {
        method: request.method,
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${CLIENT_COOKIE}=${token}`,
        },
        ...(body ? { body } : {}),
        redirect: 'error',
        signal: AbortSignal.timeout(LIMITS.TIMEOUT_MS),
      });
      const content = await upstream.text();
      if (Buffer.byteLength(content) > LIMITS.BODY_BYTES) {
        throw new Error('UPSTREAM_TOO_LARGE');
      }
      respond(response, upstream.status, content);
    } catch (error) {
      const tooLarge =
        error instanceof Error && error.message === 'BODY_TOO_LARGE';
      if (!tooLarge) {
        console.error('Questionnaire backend request failed');
      }

      respond(
        response,
        tooLarge ? 413 : 502,
        JSON.stringify({
          message: tooLarge
            ? 'Request too large'
            : 'Service unavailable; retry with the same request ID',
        }),
      );
    }
  };
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const handler = createHandler({ backendUrl: process.env.BACKEND_URL ?? '' });
  createServer((request, response) => {
    handler(request, response).catch(() => {
      console.error('Questionnaire request handler failed');
      respond(response, 500, '{"message":"Internal error"}');
    });
  }).listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
}
