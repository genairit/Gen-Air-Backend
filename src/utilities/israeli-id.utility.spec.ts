import { isValidIsraeliCompanyNumber } from './israeli-id.utility';

describe('isValidIsraeliCompanyNumber', () => {
  it.each(['514287937', '520000118', '000000018'])(
    'accepts %s, whose check digit is correct',
    (value) => {
      expect(isValidIsraeliCompanyNumber(value)).toBe(true);
    },
  );

  it.each([
    ['a wrong check digit', '514287938'],
    ['eight digits', '51428793'],
    ['ten digits', '5142879370'],
    ['a letter', '51428793a'],
    ['dashes', '514-287937'],
    ['an empty string', ''],
    ['null', null],
  ])('rejects %s', (_case, value) => {
    expect(isValidIsraeliCompanyNumber(value)).toBe(false);
  });
});
