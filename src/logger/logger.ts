import pino from 'pino';
import { OS } from '../utilities/os.utility';
import { isDate, isObject } from 'class-validator';
import { EnvironmentManager } from '../utilities/environment-manager.utility';

type TGenericObject = {
  [key: string]: unknown;
};

const REDACT_KEYS = new Set([
  'token',
  'secret',
  'apikey',
  'cookie',
  'api_key',
  'password',
  'credentials',
  'accesstoken',
  'refreshtoken',
  'access_token',
  'refresh_token',
  'authorization',
]);

const REDACT_PATTERN =
  /secret|password|token|apikey|api_key|private_key|credential/i;

const MAX_DEPTH = 10;
const REDACTED = '[REDACTED]';
const CIRCULAR = '[Circular]';
const TRUNCATED = '[Truncated]';

export const serialize = (
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
  depth = 0,
): unknown => {
  if (value === null || value === undefined) {
    return value;
  }

  if (isDate(value)) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      stack: value.stack,
      message: value.message,
      ...(Object.keys(value).length > 0 ? { ...value } : {}),
    };
  }

  if (value instanceof RegExp) {
    return value.toString();
  }

  if (typeof value === 'object' && seen.has(value)) {
    return CIRCULAR;
  }

  if (typeof value === 'object' && depth >= MAX_DEPTH) {
    return TRUNCATED;
  }

  if (value instanceof Map) {
    seen.add(value);
    return serializeObject(Object.fromEntries(value), seen, depth);
  }

  if (value instanceof Set) {
    seen.add(value);
    return Array.from(value.values()).map(item =>
      serialize(item, seen, depth + 1),
    );
  }

  if (Array.isArray(value)) {
    seen.add(value);
    return value.map(item => serialize(item, seen, depth + 1));
  }

  if (isObject(value)) {
    seen.add(value);

    if (value.constructor && value.constructor.name !== 'Object') {
      return serializeObject(
        { ...value, _class: value.constructor.name },
        seen,
        depth,
      );
    }

    return serializeObject(value, seen, depth);
  }

  return value;
};

function serializeObject(
  obj: object,
  seen: WeakSet<object> = new WeakSet(),
  depth = 0,
): Record<string, unknown> {
  const result: TGenericObject = {};

  for (const [k, v] of Object.entries(obj)) {
    if (REDACT_KEYS.has(k.toLowerCase()) || REDACT_PATTERN.test(k)) {
      result[k] = REDACTED;
      continue;
    }

    result[k] = serialize(v, seen, depth + 1);
  }

  return result;
}

const isForcedJSON = EnvironmentManager.get('FORCE_JSON_LOGS') === 'true';
const isPrettyPrint =
  !OS.isLinux() || EnvironmentManager.get('USE_PRETTY_PRINT') === 'true';

const transport =
  isPrettyPrint && !isForcedJSON
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            ignore: 'pid,hostname',
            translateTime: 'SYS:HH:MM:ss.l',
          },
        },
      }
    : {};

export const pinoLogger = pino({
  level: 'debug',
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    log(bindings) {
      return serialize(bindings) as TGenericObject;
    },
  },
  ...transport,
});