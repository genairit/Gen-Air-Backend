import { toDialablePhone } from './phone.utility';

describe('toDialablePhone', () => {
  it.each([
    ['052-1234567', '+972521234567'],
    ['052 1234567', '+972521234567'],
    ['03-1234567', '+97231234567'],
    ['+442071838750', '+442071838750'],
    ['+12025550123', '+12025550123'],
  ])('returns a dialable country-coded number for %s', (input, expected) => {
    expect(toDialablePhone(input)).toBe(expected);
  });

  it.each(['', '1234567', '+44123', '+44x2071838750', '00 44 20 7183 8750'])(
    'rejects malformed or ambiguous input %s',
    (input) => {
      expect(toDialablePhone(input)).toBeNull();
    },
  );
});
