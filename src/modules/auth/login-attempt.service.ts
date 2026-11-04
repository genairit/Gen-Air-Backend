import { createHmac } from 'node:crypto';
import { QueryTypes, Sequelize } from 'sequelize';
import { ProviderNames } from '@Providers/database/provider-names';
import { EnvironmentManager } from '@Utilities/environment-manager.utility';
import { Inject, Injectable, HttpException, HttpStatus } from '@nestjs/common';

const LOGIN_LIMIT = {
  CALLER_ATTEMPTS: 10,
  ACCOUNT_ATTEMPTS: 100,
  WINDOW_MINUTES: 15,
  CLEANUP_INTERVAL_MS: 60_000,
} as const;

interface IAttemptCount {
  accountKey: string;
  attemptCount: number;
}

@Injectable()
export class LoginAttemptService {
  private lastCleanupAt = 0;

  constructor(
    @Inject(ProviderNames.SEQUELIZE) private readonly sequelize: Sequelize,
  ) {}

  async consume(email: string, clientId: string): Promise<void> {
    await this.cleanupExpired();
    const keys = this.keys(email, clientId);
    const attempts = await this.sequelize.query<IAttemptCount>(
      `INSERT INTO public.auth_login_attempts (account_key, attempt_count, expires_at)
       VALUES
         ($accountKey, 1, now() + $windowMinutes * interval '1 minute'),
         ($callerKey, 1, now() + $windowMinutes * interval '1 minute')
       ON CONFLICT (account_key) DO UPDATE SET
         attempt_count = CASE
           WHEN auth_login_attempts.expires_at <= now() THEN 1
           ELSE auth_login_attempts.attempt_count + 1
         END,
         expires_at = CASE
           WHEN auth_login_attempts.expires_at <= now()
             THEN now() + $windowMinutes * interval '1 minute'
           ELSE auth_login_attempts.expires_at
         END
       RETURNING account_key AS "accountKey", attempt_count AS "attemptCount"`,
      {
        bind: { ...keys, windowMinutes: LOGIN_LIMIT.WINDOW_MINUTES },
        type: QueryTypes.SELECT,
      },
    );
    const account = attempts.find(
      (attempt) => attempt.accountKey === keys.accountKey,
    );
    const caller = attempts.find(
      (attempt) => attempt.accountKey === keys.callerKey,
    );
    if (
      !account ||
      !caller ||
      account.attemptCount > LOGIN_LIMIT.ACCOUNT_ATTEMPTS ||
      caller.attemptCount > LOGIN_LIMIT.CALLER_ATTEMPTS
    ) {
      throw new HttpException(
        'Too many login attempts',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async reset(email: string, clientId: string): Promise<void> {
    const keys = this.keys(email, clientId);
    await this.sequelize.query(
      'DELETE FROM public.auth_login_attempts WHERE account_key IN ($accountKey, $callerKey)',
      { bind: keys },
    );
  }

  private keys(
    email: string,
    clientId: string,
  ): { accountKey: string; callerKey: string } {
    const secret = EnvironmentManager.get('JWT_SECRET', {
      errorOnMissing: true,
    });
    const normalized = email.trim().toLowerCase();
    const hash = (value: string) =>
      createHmac('sha256', secret).update(value).digest('hex');
    return {
      accountKey: hash(`account:${normalized}`),
      callerKey: hash(`caller:${normalized}:${clientId}`),
    };
  }

  private async cleanupExpired(): Promise<void> {
    const now = Date.now();
    if (now - this.lastCleanupAt < LOGIN_LIMIT.CLEANUP_INTERVAL_MS) {
      return;
    }

    this.lastCleanupAt = now;
    await this.sequelize.query(
      'DELETE FROM public.auth_login_attempts WHERE expires_at <= now()',
    );
  }
}
