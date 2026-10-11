import {
  Logger,
  HttpStatus,
  Injectable,
  CanActivate,
  HttpException,
  ExecutionContext,
} from '@nestjs/common';

import {
  DEFAULT_RATE_LIMIT_MAX_REQUESTS,
  DEFAULT_RATE_LIMIT_REFRESH_TIME,
} from '@Constants/rate-limit';

import { Reflector } from '@nestjs/core';
import { METADATA_KEYS } from '@Constants/metadata-keys';
import { IRateLimitRecord } from '@Interfaces/rate-limit.interface';
import { IAuthenticatedRequest } from '@Interfaces/authenticated-request.interface';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly history = new Map<string, IRateLimitRecord>();
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<IAuthenticatedRequest>();
    const userId = request.user?.id;

    if (!userId) {
      return false;
    }

    const sessionId = `${userId}:${context.getClass().name}.${context.getHandler().name}`;
    const record = this.history.get(sessionId);
    const now = Date.now();

    if (!record || record.expiration < now) {
      this.history.set(sessionId, {
        count: 1,
        expiration: now + this.getRefreshTime(),
      });

      return true;
    }

    if (record.count < this.getMaxRequests(context)) {
      record.count++;

      return true;
    }

    this.logger.warn(`Rate limit exceeded for session ${sessionId}`);

    throw new HttpException(
      'Too many requests; try again shortly',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private getMaxRequests(context: ExecutionContext): number {
    const maxRequests =
      this.reflector.get<number | null>(
        METADATA_KEYS.RATE_LIMIT_MAX_REQUESTS,
        context.getHandler(),
      ) ?? DEFAULT_RATE_LIMIT_MAX_REQUESTS;

    const maxRequestsMultiplier =
      Number(process.env.RATE_LIMIT_MAX_REQUESTS_MULTIPLIER) || 1;

    return maxRequests * maxRequestsMultiplier;
  }

  private getRefreshTime(): number {
    return (
      Number(process.env.RATE_LIMIT_REFRESH_TIME) ||
      DEFAULT_RATE_LIMIT_REFRESH_TIME
    );
  }
}
