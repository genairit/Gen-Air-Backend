import { Sequelize } from 'sequelize';
import { mock } from 'jest-mock-extended';
import { HttpException } from '@nestjs/common';
import { LoginAttemptService } from './login-attempt.service';

const database = () => {
  const counts = new Map<string, number>();
  const query = jest.fn(
    (sql: string, options?: { bind?: Record<string, string> }) => {
      if (sql.startsWith('INSERT')) {
        const keys = [
          options?.bind?.accountKey,
          options?.bind?.callerKey,
          options?.bind?.globalKey,
        ];
        return Promise.resolve(
          keys.map((accountKey) => {
            if (!accountKey) {
              throw new Error('Missing bound login quota key');
            }
            const next = (counts.get(accountKey) ?? 0) + 1;
            counts.set(accountKey, next);
            return { accountKey, attemptCount: next };
          }),
        );
      }
      if (sql.includes('account_key = $accountKey')) {
        counts.delete(options?.bind?.accountKey ?? '');
      }
      return Promise.resolve([]);
    },
  );
  const sequelize = mock<Sequelize>();
  sequelize.query.mockImplementation(query);
  return { query, sequelize };
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

  it('caps one caller across different email addresses', async () => {
    const { sequelize } = database();
    const service = new LoginAttemptService(sequelize);

    await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        service.consume(`user-${index}@gen-air.example`, 'same-client'),
      ),
    );
    await expect(
      service.consume('another@gen-air.example', 'same-client'),
    ).rejects.toMatchObject({ status: 429 });
    await expect(
      service.consume('another@gen-air.example', 'other-client'),
    ).resolves.toBeUndefined();
  });

  it('caps cookie rotation and email spraying with a shared aggregate quota', async () => {
    const { sequelize } = database();
    const firstReplica = new LoginAttemptService(sequelize);
    const secondReplica = new LoginAttemptService(sequelize);

    await Promise.all(
      Array.from({ length: 300 }, (_, index) =>
        firstReplica.consume(
          `spray-${index}@gen-air.example`,
          `rotated-client-${index}`,
        ),
      ),
    );
    await expect(
      secondReplica.consume('next@gen-air.example', 'next-client'),
    ).rejects.toMatchObject({ status: 429 });
  });

  it('clears the account counter after a successful login while preserving the caller quota', async () => {
    const { sequelize } = database();
    const service = new LoginAttemptService(sequelize);
    await service.consume('user@gen-air.example', 'client-a');
    await service.reset('user@gen-air.example', 'client-a');

    await Promise.all(
      Array.from({ length: 9 }, () =>
        service.consume('user@gen-air.example', 'client-a'),
      ),
    );
    await expect(
      service.consume('user@gen-air.example', 'client-a'),
    ).rejects.toMatchObject({ status: 429 });
  });
});
