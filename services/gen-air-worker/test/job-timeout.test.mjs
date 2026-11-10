import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { JobService } from '../dist/modules/worker/job.service.js';
import { WORKER, JOB_ERROR } from '../dist/constants/worker.constant.js';

test('job timeout rejects retryably and awaits actual thread termination', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const terminate = context.mock.method(Worker.prototype, 'terminate');
  const execution = new JobService().execute({ headers: ['x'], rows: [['y']] });
  const rejected = assert.rejects(execution, {
    code: JOB_ERROR.TIMEOUT,
    retryable: true,
  });
  context.mock.timers.tick(WORKER.JOB_TIMEOUT_MS);
  await rejected;
  assert.equal(terminate.mock.callCount(), 1);
  assert.equal(terminate.mock.calls[0].this.threadId, -1);
});

['error', 'exit'].forEach((event) => {
  test(`worker thread ${event} rejects retryably and terminates the thread`, async (context) => {
    const listeners = context.mock.method(Worker.prototype, 'once');
    const terminate = context.mock.method(Worker.prototype, 'terminate');
    const execution = new JobService().execute({
      headers: ['x'],
      rows: [['y']],
    });
    const rejected = assert.rejects(execution, {
      code: JOB_ERROR.EXECUTION,
      retryable: true,
    });
    const worker = listeners.mock.calls.find(
      ({ arguments: argumentsList }) => argumentsList[0] === event,
    ).this;
    worker.emit(event, new Error('simulated thread failure'));
    await rejected;
    assert.equal(terminate.mock.callCount(), 1);
    assert.equal(worker.threadId, -1);
  });
});
