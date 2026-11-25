import {
  parseMaxToolRounds,
  readJennyMaxToolRounds,
  createJennyLlmProvider,
} from './jenny-settings.utility';

import {
  JENNY_SETTINGS,
  JENNY_ENVIRONMENT_KEYS,
} from '../constants/jenny.constant';

import { TypedLogger } from '@Logger/logger.service';
import { environmentSchema } from '@Providers/enviroment/environment.schema';

const JENNY_KEYS = Object.values(JENNY_ENVIRONMENT_KEYS);

const withEnvironment = (values: Record<string, string>): void => {
  JENNY_KEYS.forEach((key) => {
    delete process.env[key];
  });
  Object.assign(process.env, values);
};

describe('parseMaxToolRounds', () => {
  it.each([
    ['1', 1],
    ['5', 5],
    [String(JENNY_SETTINGS.MAX_TOOL_ROUNDS), JENNY_SETTINGS.MAX_TOOL_ROUNDS],
  ])('accepts %s', (raw, expected) => {
    expect(parseMaxToolRounds(raw)).toBe(expected);
  });

  it.each([
    '0',
    '-1',
    '2.5',
    'five',
    String(JENNY_SETTINGS.MAX_TOOL_ROUNDS + 1),
  ])('rejects %s', (raw) => {
    expect(parseMaxToolRounds(raw)).toBeNull();
  });
});

describe('readJennyMaxToolRounds', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
    jest.restoreAllMocks();
  });

  it('uses the configured whole number of rounds', () => {
    withEnvironment({ [JENNY_ENVIRONMENT_KEYS.MAX_TOOL_ROUNDS]: '3' });

    expect(readJennyMaxToolRounds()).toBe(3);
  });

  it.each(['', '0', '99', 'many'])(
    'falls back to the default for %p without blocking startup',
    (raw) => {
      const warn = jest.spyOn(TypedLogger.prototype, 'warn');
      withEnvironment({ [JENNY_ENVIRONMENT_KEYS.MAX_TOOL_ROUNDS]: raw });

      expect(readJennyMaxToolRounds()).toBe(
        JENNY_SETTINGS.DEFAULT_MAX_TOOL_ROUNDS,
      );
      expect(warn).toHaveBeenCalledTimes(raw ? 1 : 0);
    },
  );
});

describe('createJennyLlmProvider', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it('treats an empty API key as not configured', () => {
    withEnvironment({ [JENNY_ENVIRONMENT_KEYS.OPENAI_API_KEY]: '' });

    expect(createJennyLlmProvider().isConfigured()).toBe(false);
  });

  it('is configured when an API key is present', () => {
    withEnvironment({ [JENNY_ENVIRONMENT_KEYS.OPENAI_API_KEY]: 'sk-test' });

    expect(createJennyLlmProvider().isConfigured()).toBe(true);
  });
});

describe('environment schema for Jenny', () => {
  const REQUIRED = {
    DB_USER: 'user',
    DB_HOST: 'host',
    DB_NAME: 'name',
    DB_PASS: 'pass',
    JWT_SECRET: 'jwt',
    AUTH_CLIENT_SECRET: 'x'.repeat(32),
  };

  it.each([
    {},
    {
      OPENAI_API_KEY: '',
      JENNY_MODEL: '',
      JENNY_MAX_TOOL_ROUNDS: '',
    },
    { OPENAI_API_KEY: 'sk-test', JENNY_MAX_TOOL_ROUNDS: '99' },
  ])('never blocks startup for Jenny settings %p', (jennySettings) => {
    expect(
      environmentSchema.validate({ ...REQUIRED, ...jennySettings }).error,
    ).toBeUndefined();
  });
});
