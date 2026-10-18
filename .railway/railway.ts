import { github, project, service, preserve, defineRailway } from 'railway/iac';

export const partial = 'Gen-Air-Backend';

const ENVIRONMENT_NAMES = {
  TEST: 'test',
  PRODUCTION: 'production',
  DEVELOPMENT: 'development',
} as const;

type EnvironmentNameType =
  (typeof ENVIRONMENT_NAMES)[keyof typeof ENVIRONMENT_NAMES];

const BRANCH_BY_ENVIRONMENT: Record<EnvironmentNameType, string> = {
  [ENVIRONMENT_NAMES.TEST]: 'test',
  [ENVIRONMENT_NAMES.PRODUCTION]: 'main',
  [ENVIRONMENT_NAMES.DEVELOPMENT]: 'dev',
};

const isEnvironmentName = (name?: string | null): name is EnvironmentNameType =>
  Object.values(ENVIRONMENT_NAMES).some(
    (environmentName) => environmentName === name,
  );

export const resolveBranch = (environmentName?: string | null): string => {
  if (!isEnvironmentName(environmentName)) {
    throw new Error(
      `No branch mapped for Railway environment "${environmentName}"`,
    );
  }

  return BRANCH_BY_ENVIRONMENT[environmentName];
};

export default defineRailway((context) => {
  const backend = service(partial, {
    start: 'npm run start:prod',
    regions: { 'europe-west4-drams3a': 1 },
    build: { builder: 'RAILPACK', buildCommand: 'npm run build' },
    source: github('genairit/Gen-Air-Backend', {
      branch: resolveBranch(context.environmentName),
    }),
    env: {
      PORT: '3000',
      DB_SSL: 'true',
      DB_PASS: preserve(),
      DB_HOST: preserve(),
      DB_NAME: preserve(),
      DB_PORT: preserve(),
      DB_USER: preserve(),
      JWT_SECRET: preserve(),
      FORCE_JSON_LOGS: 'true',
      GOOGLE_PLACES_API_KEY: preserve(),
      DB_SSL_REJECT_UNAUTHORIZED: 'false',
      GOOGLE_DRIVE_ROOT_FOLDER_ID: preserve(),
      GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON: preserve(),
    },
  });

  return project('gen-air', { resources: [backend] });
});
