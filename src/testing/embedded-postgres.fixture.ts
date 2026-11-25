import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { ModelCtor, Sequelize } from 'sequelize-typescript';

interface IEmbeddedPostgresState {
  started: boolean;
  directory: string | null;
  database: Sequelize | null;
}

const execute = promisify(execFile);
const LOOPBACK_HOST = '127.0.0.1';
const DATABASE_LOCALE = 'en_US.UTF-8';
const binaries = resolve(
  process.cwd(),
  'node_modules',
  '@embedded-postgres',
  `${process.platform}-${process.arch}`,
  'native',
  'bin',
);

const reservePort = async (): Promise<number> => {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, LOOPBACK_HOST, done));
  const address = server.address();
  await new Promise<void>((done) => server.close(() => done()));

  if (!address || typeof address === 'string') {
    throw new Error('Could not reserve a PostgreSQL port');
  }

  return address.port;
};

export class EmbeddedPostgresFixture {
  private readonly state: IEmbeddedPostgresState = {
    started: false,
    database: null,
    directory: null,
  };

  constructor(private readonly models: ModelCtor[]) {}

  database(): Sequelize {
    if (!this.state.database) {
      throw new Error('Embedded PostgreSQL is not started');
    }

    return this.state.database;
  }

  async start(): Promise<Sequelize> {
    const directory = await mkdtemp(join(tmpdir(), 'genair-postgres-'));
    const port = await reservePort();
    this.state.directory = directory;

    await execute(resolve(binaries, 'initdb'), [
      '-D',
      directory,
      '-U',
      'postgres',
      '--auth=trust',
      '--encoding=UTF8',
      `--locale=${DATABASE_LOCALE}`,
    ]);
    await execute(resolve(binaries, 'pg_ctl'), [
      '-D',
      directory,
      '-o',
      `-h ${LOOPBACK_HOST} -p ${port} -c listen_addresses=${LOOPBACK_HOST}`,
      '-l',
      join(directory, 'postgres.log'),
      '-w',
      'start',
    ]);
    this.state.started = true;
    this.state.database = new Sequelize('postgres', 'postgres', '', {
      port,
      logging: false,
      host: LOOPBACK_HOST,
      dialect: 'postgres',
      models: this.models,
      define: { underscored: true, timestamps: true },
    });

    return this.state.database;
  }

  async stop(): Promise<void> {
    await this.state.database?.close();

    if (this.state.started && this.state.directory) {
      await execute(resolve(binaries, 'pg_ctl'), [
        '-D',
        this.state.directory,
        '-m',
        'immediate',
        '-w',
        'stop',
      ]);
    }

    if (this.state.directory) {
      await rm(this.state.directory, { recursive: true, force: true });
    }
  }
}
