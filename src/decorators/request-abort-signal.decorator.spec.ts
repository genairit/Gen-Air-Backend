import {
  toRequestAbortSignal,
  ClientDisconnectedError,
} from './request-abort-signal.decorator';

import { EventEmitter } from 'node:events';

const fakeResponse = (writableFinished: boolean) =>
  Object.assign(new EventEmitter(), { writableFinished });

describe('toRequestAbortSignal', () => {
  it('aborts when the connection closes before the response is sent', () => {
    const response = fakeResponse(false);
    const signal = toRequestAbortSignal(response);

    response.emit('close');

    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBeInstanceOf(ClientDisconnectedError);
  });

  it('stays active when the connection closes after the response finished', () => {
    const response = fakeResponse(true);
    const signal = toRequestAbortSignal(response);

    response.emit('close');

    expect(signal.aborted).toBe(false);
  });
});
