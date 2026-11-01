import { isProtectedTaskType } from './task-type.utility';
import { TASK_TYPES } from '../constants/task-type.constant';

describe('protected task type predicate', () => {
  it.each([null, TASK_TYPES.GENERAL])('does not protect %s', (type) => {
    expect(isProtectedTaskType(type)).toBe(false);
  });

  it.each([TASK_TYPES.QUOTATION, TASK_TYPES.PLANNING])(
    'protects the mandatory %s type',
    (type) => {
      expect(isProtectedTaskType(type)).toBe(true);
    },
  );
});
