import { JENNY_SETTINGS } from '../constants/jenny.constant';
import { parseMaxToolRounds } from './jenny-settings.utility';

describe('parseMaxToolRounds', () => {
  it.each([
    ['1', 1],
    ['5', 5],
    [String(JENNY_SETTINGS.MAX_TOOL_ROUNDS), JENNY_SETTINGS.MAX_TOOL_ROUNDS],
  ])('accepts %s', (raw, expected) => {
    expect(parseMaxToolRounds(raw)).toBe(expected);
  });

  it.each([
    '0',
    '-1',
    '2.5',
    'five',
    String(JENNY_SETTINGS.MAX_TOOL_ROUNDS + 1),
  ])('rejects %s', (raw) => {
    expect(parseMaxToolRounds(raw)).toBeNull();
  });
});
