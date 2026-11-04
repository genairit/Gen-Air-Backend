import { Sequelize } from 'sequelize';
import { HttpException } from '@nestjs/common';
import { LoginAttemptService } from './login-attempt.service';

const database = () => {
  const counts = new Map<string, number>();
  const query = jest.fn(
    (sql: string, options?: { bind?: Record<string, string> }) => {
      if (sql.startsWith('INSERT')) {
        const keys = [options?.bind?.accountKey, options?.bind?.callerKey];
        return keys.map((accountKey) => {
          const next = (counts.get(accountKey!) ?? 0) + 1;
          counts.set(accountKey!, next);
          return { accountKey, attemptCount: next };
        });
      }
      if (sql.includes('account_key IN')) {
        counts.delete(options?.bind?.accountKey ?? '');
        counts.delete(options?.bind?.callerKey ?? '');
      }
      return [];
    },
  );
  return { query, sequelize: { query } as unknown as Sequelize };
};

describe('LoginAttemptService policy', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'login-attempt-test-secret-at-least-32-chars';
  });

  it('isolates callers while preserving a shared account ceiling across service instances', async () => {
    const { sequelize } = database();
    const firstReplica = new LoginAttemptService(sequelize);
    const secondReplica = new LoginAttemptService(sequelize);

    await Promise.all(
      Array.from({ length: 10 }, () =>
        firstReplica.consume('Engineer@Gen-Air.example', 'client-a'),
      ),
    );
    await expect(
      firstReplica.consume('engineer@gen-air.example', 'client-a'),
    ).rejects.toMatchObject({ status: 429 });
    await expect(
      secondReplica.consume('engineer@gen-air.example', 'client-b'),
    ).resolves.toBeUndefined();
  });

  it('caps distributed guesses for one account and permits a different account', async () => {
    const { sequelize } = database();
    const service = new LoginAttemptService(sequelize);

    await Promise.all(
      Array.from({ length: 100 }, (_, index) =>
        service.consume('target@gen-air.example', `client-${index}`),
      ),
    );
    await expect(
      service.consume('target@gen-air.example', 'new-client'),
    ).rejects.toBeInstanceOf(HttpException);
    await expect(
      service.consume('other@gen-air.example', 'new-client'),
    ).resolves.toBeUndefined();
  });

  it('clears account and caller counters after a successful login', async () => {
    const { sequelize } = database();
    const service = new LoginAttemptService(sequelize);
    await service.consume('user@gen-air.example', 'client-a');
    await service.reset('user@gen-air.example', 'client-a');

    await Promise.all(
      Array.from({ length: 10 }, () =>
        service.consume('user@gen-air.example', 'client-a'),
      ),
    );
    await expect(
      service.consume('user@gen-air.example', 'client-a'),
    ).rejects.toMatchObject({ status: 429 });
  });
});
