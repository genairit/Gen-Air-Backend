import { formatProjectCode, generateProjectCode } from './project-code.utility';

const PROJECT_CODE_FORMAT = /^[^-]{2}-[0-9]{5}$/;

describe('formatProjectCode', () => {
  it('joins the first and last name initials with a zero-padded serial', () => {
    const code = formatProjectCode({ firstName: 'אביעד', lastName: 'כהן' }, 42);

    expect(code).toBe('אכ-00042');
  });

  it('takes the first letter of a multi-word last name', () => {
    const code = formatProjectCode(
      { firstName: 'דוד', lastName: 'בן שחר' },
      12345,
    );

    expect(code).toBe('דב-12345');
  });

  it('ignores surrounding whitespace and keeps latin initials as stored', () => {
    const code = formatProjectCode(
      { firstName: '  Yuval', lastName: 'El ' },
      7,
    );

    expect(code).toBe('YE-00007');
  });
});

describe('generateProjectCode', () => {
  it('always matches the database code format', () => {
    const codes = Array.from({ length: 200 }, () =>
      generateProjectCode({ firstName: 'מיכל', lastName: 'רוזנברג' }),
    );

    expect(codes.every((code) => PROJECT_CODE_FORMAT.test(code))).toBe(true);
  });
});
