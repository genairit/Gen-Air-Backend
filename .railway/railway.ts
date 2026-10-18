import { github, project, service, preserve, defineRailway } from 'railway/iac';

export const partial = 'Gen-Air-Backend';

const BRANCH_BY_ENVIRONMENT: Record<string, string> = {
  test: 'test',
  production: 'main',
  development: 'dev',
};

export default defineRailway((context) => {
  const backend = service('Gen-Air-Backend', {
    start: 'npm run start:prod',
    regions: { 'europe-west4-drams3a': 1 },
    build: { builder: 'RAILPACK', buildCommand: 'npm run build' },
    source: github('kfirmr/Gen-Air-Backend', {
      branch: BRANCH_BY_ENVIRONMENT[context.environmentName ?? 'development'],
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
