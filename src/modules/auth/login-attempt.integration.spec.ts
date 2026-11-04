import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Sequelize } from 'sequelize';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { TIME_UNITS } from '@Constants/time.constant';
import { LoginAttemptService } from './login-attempt.service';

jest.setTimeout(2 * TIME_UNITS.MINUTE_MS);
const executeFile = promisify(execFile);
const postgresBinaryDirectory = join(
  process.cwd(),
  'node_modules',
  '@embedded-postgres',
  `${process.platform}-${process.arch}`,
  'native',
  'bin',
);
const postgresControl = join(postgresBinaryDirectory, 'pg_ctl');
const postgresInitializer = join(postgresBinaryDirectory, 'initdb');

interface IIntegrationState {
  postgresStarted: boolean;
  databaseDir: string | null;
  firstConnection: Sequelize | null;
  secondConnection: Sequelize | null;
  firstReplica: LoginAttemptService | null;
  secondReplica: LoginAttemptService | null;
}

const state: IIntegrationState = {
  databaseDir: null,
  postgresStarted: false,
  firstConnection: null,
  secondConnection: null,
  firstReplica: null,
  secondReplica: null,
};

const requireState = () => {
  if (!state.firstConnection || !state.firstReplica || !state.secondReplica) {
    throw new Error('PostgreSQL login limiter test is not initialized');
  }
  return {
    firstConnection: state.firstConnection,
    firstReplica: state.firstReplica,
    secondReplica: state.secondReplica,
  };
};

const availablePort = async (): Promise<number> => {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Could not reserve a PostgreSQL port');
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
};

describe('LoginAttemptService PostgreSQL limits', () => {
  beforeAll(async () => {
    process.env.JWT_SECRET = 'login-attempt-integration-test-secret';
    state.databaseDir = await mkdtemp(join(tmpdir(), 'genair-login-limiter-'));
    const port = await availablePort();
    await executeFile(postgresInitializer, [
      '-D',
      state.databaseDir,
      '-U',
      'postgres',
      '--auth=trust',
    ]);
    await executeFile(postgresControl, [
      '-D',
      state.databaseDir,
      '-o',
      `-h 127.0.0.1 -p ${port} -c listen_addresses=127.0.0.1`,
      '-l',
      join(state.databaseDir, 'postgres.log'),
      '-w',
      'start',
    ]);
    state.postgresStarted = true;
    const connection = () =>
      new Sequelize('postgres', 'postgres', '', {
        dialect: 'postgres',
        host: '127.0.0.1',
        port,
        logging: false,
        pool: { max: 8, min: 0 },
      });
    state.firstConnection = connection();
    state.secondConnection = connection();
    await state.firstConnection.query(`
      CREATE TABLE public.auth_login_attempts (
        account_key char(64) PRIMARY KEY,
        attempt_count integer NOT NULL,
        expires_at timestamptz NOT NULL
      );
    `);
    state.firstReplica = new LoginAttemptService(state.firstConnection);
    state.secondReplica = new LoginAttemptService(state.secondConnection);
  });

  afterAll(async () => {
    await state.firstConnection?.close();
    await state.secondConnection?.close();
    if (state.postgresStarted && state.databaseDir) {
      await executeFile(postgresControl, [
        '-D',
        state.databaseDir,
        '-m',
        'immediate',
        '-w',
        'stop',
      ]);
    }
    if (state.databaseDir) {
      await rm(state.databaseDir, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    const { firstConnection } = requireState();
    await firstConnection.query('TRUNCATE public.auth_login_attempts');
  });

  it('shares the per-caller quota across email addresses and connections', async () => {
    const { firstReplica, secondReplica } = requireState();
    await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        (index % 2 === 0 ? firstReplica : secondReplica).consume(
          `caller-${index}@example.invalid`,
          'one-cookie',
        ),
      ),
    );
    await expect(
      secondReplica.consume('next@example.invalid', 'one-cookie'),
    ).rejects.toMatchObject({ status: 429 });
  });

  it('shares the account quota across rotating cookies', async () => {
    const { firstReplica, secondReplica } = requireState();
    await Promise.all(
      Array.from({ length: 100 }, (_, index) =>
        (index % 2 === 0 ? firstReplica : secondReplica).consume(
          'target@example.invalid',
          `cookie-${index}`,
        ),
      ),
    );
    await expect(
      firstReplica.consume('target@example.invalid', 'new-cookie'),
    ).rejects.toMatchObject({ status: 429 });
  });

  it('bounds global work across rotating cookies and accounts, then expires', async () => {
    const { firstConnection, firstReplica, secondReplica } = requireState();
    await Promise.all(
      Array.from({ length: 300 }, (_, index) =>
        (index % 2 === 0 ? firstReplica : secondReplica).consume(
          `spray-${index}@example.invalid`,
          `rotated-cookie-${index}`,
        ),
      ),
    );
    await expect(
      firstReplica.consume('next@example.invalid', 'next-cookie'),
    ).rejects.toMatchObject({ status: 429 });

    await firstConnection.query(
      "UPDATE public.auth_login_attempts SET expires_at = now() - interval '1 second'",
    );
    await expect(
      secondReplica.consume('next@example.invalid', 'next-cookie'),
    ).resolves.toBeUndefined();
  });
});
