import { isDueDateBeforeToday } from './date.utility';

describe('task due-date calendar boundary', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-14T10:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());
  it('allows today and future dates, and rejects yesterday', () => {
    expect(isDueDateBeforeToday('2026-10-14')).toBe(false);
    expect(isDueDateBeforeToday('2026-10-15')).toBe(false);
    expect(isDueDateBeforeToday('2026-10-13')).toBe(true);
  });
  it('uses the configured Jerusalem day rather than the UTC day', () => {
    expect(isDueDateBeforeToday('2026-10-13T20:59:59Z')).toBe(true);
    expect(isDueDateBeforeToday('2026-10-13T21:00:00Z')).toBe(false);
  });
});
