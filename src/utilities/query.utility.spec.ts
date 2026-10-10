import { toContainsPattern, whereWhenPresent } from './query.utility';

describe('toContainsPattern', () => {
  it('wraps the value in wildcards', () => {
    expect(toContainsPattern('בבלי')).toBe('%בבלי%');
  });

  it('escapes LIKE wildcards typed by the user', () => {
    expect(toContainsPattern('50%_a\\b')).toBe('%50\\%\\_a\\\\b%');
  });
});

describe('whereWhenPresent', () => {
  it('skips the condition when the value is null', () => {
    expect(whereWhenPresent(null, (role) => ({ role }))).toEqual([]);
  });

  it('builds the condition when the value is present', () => {
    expect(whereWhenPresent('secretary', (role) => ({ role }))).toEqual([
      { role: 'secretary' },
    ]);
  });
});
