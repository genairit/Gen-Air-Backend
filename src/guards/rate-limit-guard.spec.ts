import { Reflector } from '@nestjs/core';
import { TIME_UNITS } from '@Constants/date';
import { RateLimitGuard } from './rate-limit-guard';
import { HttpStatus, HttpException } from '@nestjs/common';
import { RateLimit } from '@Decorators/rate-limit.decorator';
import { DEFAULT_RATE_LIMIT_MAX_REQUESTS } from '@Constants/rate-limit';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';

const MAX_REQUESTS = 2;

class SearchController {
  @RateLimit(MAX_REQUESTS)
  search(this: void): void {}

  @RateLimit(MAX_REQUESTS)
  lookup(this: void): void {}

  unlimited(this: void): void {}
}

const buildContext = (
  handler: () => void,
  request: object = { user: { id: 'user-1' } },
) => new ExecutionContextHost([request], SearchController, handler);

const callTimes = (guard: RateLimitGuard, handler: () => void, times: number) =>
  Array.from({ length: times }, () => guard.canActivate(buildContext(handler)));

const getRejectionStatus = (attempt: () => boolean): number | null => {
  try {
    attempt();

    return null;
  } catch (error) {
    if (!(error instanceof HttpException)) {
      throw error;
    }

    return error.getStatus();
  }
};

describe('RateLimitGuard', () => {
  const handlers = SearchController.prototype;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('allows requests up to the limit set by @RateLimit', () => {
    const guard = new RateLimitGuard(new Reflector());

    expect(callTimes(guard, handlers.search, MAX_REQUESTS)).toEqual([
      true,
      true,
    ]);
  });

  it('answers 429 once the limit is reached', () => {
    const guard = new RateLimitGuard(new Reflector());

    callTimes(guard, handlers.search, MAX_REQUESTS);

    expect(
      getRejectionStatus(() =>
        guard.canActivate(buildContext(handlers.search)),
      ),
    ).toBe(HttpStatus.TOO_MANY_REQUESTS);
  });

  it('counts every search on a route together, whatever its query string', () => {
    const guard = new RateLimitGuard(new Reflector());
    const searchFor = (input: string) =>
      guard.canActivate(
        buildContext(handlers.search, {
          user: { id: 'user-1' },
          originalUrl: `/address/suggestions?input=${input}`,
        }),
      );

    searchFor('ה');
    searchFor('הר');

    expect(getRejectionStatus(() => searchFor('הרצ'))).toBe(
      HttpStatus.TOO_MANY_REQUESTS,
    );
  });

  it('keeps a separate allowance per user and per route', () => {
    const guard = new RateLimitGuard(new Reflector());
    const otherUser = { user: { id: 'user-2' } };

    callTimes(guard, handlers.search, MAX_REQUESTS);

    expect(guard.canActivate(buildContext(handlers.lookup))).toBe(true);
    expect(guard.canActivate(buildContext(handlers.search, otherUser))).toBe(
      true,
    );
  });

  it('restores the allowance once the window passes', () => {
    const guard = new RateLimitGuard(new Reflector());

    callTimes(guard, handlers.search, MAX_REQUESTS);
    jest.advanceTimersByTime(TIME_UNITS.MINUTES + 1);

    expect(guard.canActivate(buildContext(handlers.search))).toBe(true);
  });

  it('falls back to the default limit without @RateLimit', () => {
    const guard = new RateLimitGuard(new Reflector());

    callTimes(guard, handlers.unlimited, DEFAULT_RATE_LIMIT_MAX_REQUESTS);

    expect(
      getRejectionStatus(() =>
        guard.canActivate(buildContext(handlers.unlimited)),
      ),
    ).toBe(HttpStatus.TOO_MANY_REQUESTS);
  });

  it('rejects a request without an authenticated user', () => {
    const guard = new RateLimitGuard(new Reflector());

    expect(guard.canActivate(buildContext(handlers.search, {}))).toBe(false);
  });
});
