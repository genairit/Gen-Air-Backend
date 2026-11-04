import { buildSequelizeOptions } from './database.provider';
import { EnvironmentManager } from '@Utilities/environment-manager.utility';

const databaseEnvironment: Record<string, string> = {
  DB_NAME: 'postgres',
  DB_USER: 'postgres.project',
  DB_PASS: 'test-password',
  DB_HOST: 'aws-0-region.pooler.supabase.com',
  DB_PORT: '5432',
  DB_SSL: 'true',
  DB_SSL_CA: 'test-certificate',
};

describe('buildSequelizeOptions', () => {
  afterEach(() => jest.restoreAllMocks());

  it('verifies the configured database host against the supplied root CA', () => {
    jest
      .spyOn(EnvironmentManager, 'get')
      .mockImplementation((key) => databaseEnvironment[key] ?? '');

    expect(buildSequelizeOptions().dialectOptions).toEqual({
      ssl: {
        ca: databaseEnvironment.DB_SSL_CA,
        require: true,
        servername: databaseEnvironment.DB_HOST,
        rejectUnauthorized: true,
      },
    });
  });

  it('fails closed when TLS is enabled without a root CA', () => {
    jest.spyOn(EnvironmentManager, 'get').mockImplementation((key, options) => {
      if (key === 'DB_SSL_CA' && options?.errorOnMissing) {
        throw new Error('DB_SSL_CA is missing from the environment variables');
      }

      return key === 'DB_SSL_CA' ? '' : (databaseEnvironment[key] ?? '');
    });

    expect(() => buildSequelizeOptions()).toThrow('DB_SSL_CA is missing');
  });

  it('does not require a certificate for an explicitly non-TLS local database', () => {
    jest
      .spyOn(EnvironmentManager, 'get')
      .mockImplementation((key) =>
        key === 'DB_SSL' ? 'false' : (databaseEnvironment[key] ?? ''),
      );

    expect(buildSequelizeOptions().dialectOptions).toBeUndefined();
  });
});
