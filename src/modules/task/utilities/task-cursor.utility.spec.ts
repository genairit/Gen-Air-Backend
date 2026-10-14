import {
  decodeTaskCursor,
  encodeTaskCursor,
  toTaskCursorPage,
  buildTaskCursorWhere,
} from './task-cursor.utility';

import { TASK_ORDER } from '../constants/task-order.constant';

const first = {
  id: '00000000-0000-4000-8000-000000000001',
  isUrgent: true,
  dueDate: new Date('2099-01-01'),
};
describe('task cursor contract', () => {
  it('round-trips date and null-date positions', () => {
    expect(decodeTaskCursor(encodeTaskCursor(first))).toEqual(first);
    expect(
      decodeTaskCursor(encodeTaskCursor({ ...first, dueDate: null })),
    ).toEqual({ ...first, dueDate: null });
  });
  it('rejects malformed and old created-at cursors', () => {
    for (const value of [
      '',
      'invalid',
      Buffer.from(
        JSON.stringify({ id: first.id, createdAt: '2099-01-01' }),
      ).toString('base64url'),
      Buffer.from(JSON.stringify({ ...first, dueDate: 'invalid' })).toString(
        'base64url',
      ),
    ]) {
      expect(decodeTaskCursor(value)).toBeNull();
    }
  });
  it('paginates with the ordering fields and a final null cursor', () => {
    const second = { ...first, id: '00000000-0000-4000-8000-000000000002' };
    const page = toTaskCursorPage([first, second], 1);
    expect(page.items).toEqual([first]);
    expect(decodeTaskCursor(page.nextCursor)).toEqual(first);
    expect(toTaskCursorPage([second], 1).nextCursor).toBeNull();
    expect(TASK_ORDER).toEqual([
      ['isUrgent', 'DESC'],
      ['dueDate', 'ASC NULLS LAST'],
      ['id', 'ASC'],
    ]);
    expect(buildTaskCursorWhere(page.nextCursor)).toHaveLength(1);
    expect(
      buildTaskCursorWhere(encodeTaskCursor({ ...first, dueDate: null })),
    ).toHaveLength(1);
  });
});
