import { resolveBranch } from './railway';

describe('resolveBranch', () => {
  it.each([
    ['test', 'test'],
    ['production', 'main'],
    ['development', 'dev'],
  ])('deploys the %s environment from %s', (environmentName, branch) => {
    expect(resolveBranch(environmentName)).toBe(branch);
  });

  it.each(['pr-12', '', null])(
    'rejects the unmapped environment %p',
    (environmentName) => {
      expect(() => resolveBranch(environmentName)).toThrow(
        'No branch mapped for Railway environment',
      );
    },
  );
});
