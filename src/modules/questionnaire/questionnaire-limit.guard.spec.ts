import { HttpException } from '@nestjs/common';
import { QuestionnaireLimitGuard } from './questionnaire-limit.guard';
import { QUESTIONNAIRE_LIMITS } from './constants/questionnaire.constant';
import { signAnonymousClient } from '@Utilities/anonymous-client.utility';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';

const CLIENT_SECRET = 'questionnaire-test-secret-at-least-32-chars';
const clientCookie = (id: string) =>
  `genair_anonymous_client=${signAnonymousClient(id.repeat(32), CLIENT_SECRET)}`;
const context = (
  method: string,
  body: unknown = null,
  cookie = clientCookie('a'),
): ExecutionContextHost =>
  new ExecutionContextHost([
    { method, body, headers: { cookie } },
    { setHeader: jest.fn() },
  ]);

const expectStatus = (action: () => unknown, expected: number): void => {
  try {
    action();
    throw new Error('Expected request rejection');
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    if (error instanceof HttpException) {
      expect(error.getStatus()).toBe(expected);
    }
  }
};

describe('Questionnaire resource limits', () => {
  beforeAll(() => {
    process.env.QUESTIONNAIRE_CLIENT_SECRET = CLIENT_SECRET;
  });
  afterEach(() => jest.restoreAllMocks());

  it('allows the submission budget exactly, rejects overflow and resets at the boundary', () => {
    const clock = jest.spyOn(Date, 'now').mockReturnValue(100000);
    const guard = new QuestionnaireLimitGuard();
    Array.from({ length: QUESTIONNAIRE_LIMITS.SUBMISSIONS_PER_WINDOW }).forEach(
      () => expect(guard.canActivate(context('POST'))).toBe(true),
    );
    expectStatus(() => guard.canActivate(context('POST')), 429);
    clock.mockReturnValue(100000 + QUESTIONNAIRE_LIMITS.WINDOW_MS - 1);
    expectStatus(() => guard.canActivate(context('POST')), 429);
    clock.mockReturnValue(100000 + QUESTIONNAIRE_LIMITS.WINDOW_MS);
    expect(guard.canActivate(context('POST'))).toBe(true);
  });

  it('accounts for reads separately from submission requests', () => {
    jest.spyOn(Date, 'now').mockReturnValue(100000);
    const guard = new QuestionnaireLimitGuard();
    Array.from({ length: QUESTIONNAIRE_LIMITS.READS_PER_WINDOW }).forEach(() =>
      expect(guard.canActivate(context('GET'))).toBe(true),
    );
    expectStatus(() => guard.canActivate(context('GET')), 429);
    expect(guard.canActivate(context('POST'))).toBe(true);
  });

  it('keeps another caller available after one caller exhausts the submission quota', () => {
    jest.spyOn(Date, 'now').mockReturnValue(100000);
    const guard = new QuestionnaireLimitGuard();
    Array.from({ length: QUESTIONNAIRE_LIMITS.SUBMISSIONS_PER_WINDOW }).forEach(
      () => expect(guard.canActivate(context('POST'))).toBe(true),
    );
    expectStatus(() => guard.canActivate(context('POST')), 429);
    expect(guard.canActivate(context('POST', null, clientCookie('b')))).toBe(
      true,
    );
  });

  it('measures serialized UTF-8 bytes, allowing the exact boundary but not one byte more', () => {
    const guard = new QuestionnaireLimitGuard();
    const exact = 'a'.repeat(QUESTIONNAIRE_LIMITS.MAX_BODY_BYTES - 2);
    expect(guard.canActivate(context('POST', exact))).toBe(true);
    expectStatus(() => guard.canActivate(context('POST', `${exact}a`)), 413);
    const unicode = 'א'.repeat(QUESTIONNAIRE_LIMITS.MAX_BODY_BYTES / 2);
    expect(unicode.length).toBeLessThan(QUESTIONNAIRE_LIMITS.MAX_BODY_BYTES);
    expectStatus(() => guard.canActivate(context('POST', unicode)), 413);
  });

  it('charges invalid oversized attempts against the request budget', () => {
    jest.spyOn(Date, 'now').mockReturnValue(100000);
    const guard = new QuestionnaireLimitGuard();
    Array.from({ length: QUESTIONNAIRE_LIMITS.SUBMISSIONS_PER_WINDOW }).forEach(
      () =>
        expectStatus(
          () =>
            guard.canActivate(
              context('POST', 'a'.repeat(QUESTIONNAIRE_LIMITS.MAX_BODY_BYTES)),
            ),
          413,
        ),
    );
    expectStatus(() => guard.canActivate(context('POST')), 429);
  });
});
