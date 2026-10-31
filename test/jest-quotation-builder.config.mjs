import packageJson from '../package.json' with { type: 'json' };

export default {
  ...packageJson.jest,
  rootDir: '..',
  testRegex: 'test/quotation-builder.integration-spec.ts$',
  moduleNameMapper: Object.fromEntries(
    Object.entries(packageJson.jest.moduleNameMapper).map(([alias, target]) => [
      alias,
      target.replace('<rootDir>', '<rootDir>/src'),
    ]),
  ),
};
