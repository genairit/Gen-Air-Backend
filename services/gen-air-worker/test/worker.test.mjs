import {
  WORKER,
  JOB_ERROR,
  JOB_STATUS,
} from '../dist/constants/worker.constant.js';

import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { JobError } from '../dist/errors/job.error.js';
import { WorkerService } from '../dist/modules/worker/worker.service.js';

const job = {
  attempt: 1,
  jobId: 'job-1',
  tenantId: 'tenant-1',
  version: WORKER.VERSION,
  jobType: WORKER.JOB_TYPE,
  payload: { headers: ['Name'], rows: [['Alice']] },
};
const output = {
  csv: '"Name"\r\n"Alice"\r\n',
  rowCount: 1,
  contentType: 'text/csv; charset=utf-8',
};
const encode = (value) => Buffer.from(JSON.stringify(value));
const createTransport = () => {
  const events = [];
  return {
    events,
    acknowledge: () => events.push({ type: 'ack' }),
    publishRetry: async (value) => {
      events.push({ type: 'retry', value });
    },
    publishResult: async (value) => {
      events.push({ type: 'result', value });
    },
    publishFailure: async (value) => {
      events.push({ type: 'failure', value });
    },
  };
};
const failingJobs = (error) => ({
  execute: async () => {
    throw error;
  },
});
const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

test('successful jobs await result confirmation before acknowledging', async () => {
  const confirmation = Promise.withResolvers();
  const transport = createTransport();
  const publishResult = transport.publishResult;
  transport.publishResult = async (value) => {
    await publishResult(value);
    await confirmation.promise;
  };
  const operation = new WorkerService({ execute: async () => output }).process(
    encode(job),
    transport,
  );
  await flushPromises();
  assert.deepEqual(
    transport.events.map(({ type }) => type),
    ['result'],
  );
  confirmation.resolve();
  await operation;
  assert.deepEqual(
    transport.events.map(({ type }) => type),
    ['result', 'ack'],
  );
  assert.deepEqual(transport.events[0].value, {
    ...Object.fromEntries(
      Object.entries(job).filter(([key]) => key !== 'payload'),
    ),
    completedAt: transport.events[0].value.completedAt,
    status: JOB_STATUS.SUCCEEDED,
    error: null,
    output,
  });
  assert.ok(Number.isFinite(Date.parse(transport.events[0].value.completedAt)));
});

test('failed result publication leaves the source message unacknowledged', async () => {
  const transport = createTransport();
  transport.publishResult = async () => {
    throw new Error('broker unavailable');
  };
  await assert.rejects(
    new WorkerService({ execute: async () => output }).process(
      encode(job),
      transport,
    ),
    /broker unavailable/,
  );
  assert.deepEqual(transport.events, []);
});

test('retryable failures increment attempts with bounded delayed retries', async () => {
  const worker = new WorkerService(failingJobs(new Error('temporary failure')));
  const first = createTransport();
  const firstOperation = worker.process(encode(job), first);
  await flushPromises();
  assert.deepEqual(first.events, []);
  await firstOperation;
  assert.deepEqual(first.events, [
    { type: 'retry', value: { ...job, attempt: 2 } },
    { type: 'ack' },
  ]);
  const terminal = createTransport();
  await worker.process(
    encode({ ...job, attempt: WORKER.MAX_ATTEMPTS }),
    terminal,
  );
  assert.deepEqual(
    terminal.events.map(({ type }) => type),
    ['result', 'failure', 'ack'],
  );
  assert.equal(terminal.events[0].value.status, JOB_STATUS.FAILED);
  assert.equal(terminal.events[0].value.error, JOB_ERROR.EXECUTION);
  assert.equal(terminal.events[0].value.output, null);
});

test('non-retryable failures publish terminal result and quarantine before ack', async () => {
  const transport = createTransport();
  const worker = new WorkerService(
    failingJobs(new JobError(JOB_ERROR.INVALID, false)),
  );
  await worker.process(encode(job), transport);
  assert.deepEqual(
    transport.events.map(({ type }) => type),
    ['result', 'failure', 'ack'],
  );
  assert.equal(transport.events[0].value.error, JOB_ERROR.INVALID);
  assert.deepEqual({ ...transport.events[1].value.job }, job);
  assert.deepEqual(transport.events[1].value.result, transport.events[0].value);
});

test('failed terminal quarantine publication prevents acknowledgment', async () => {
  const transport = createTransport();
  transport.publishFailure = async () => {
    throw new Error('quarantine unavailable');
  };
  const worker = new WorkerService(
    failingJobs(new JobError(JOB_ERROR.INVALID, false)),
  );
  await assert.rejects(
    worker.process(encode(job), transport),
    /quarantine unavailable/,
  );
  assert.deepEqual(
    transport.events.map(({ type }) => type),
    ['result'],
  );
});

test('invalid envelopes quarantine a digest without executing or leaking content', async () => {
  const transport = createTransport();
  const worker = new WorkerService({
    execute: async () => assert.fail('invalid job executed'),
  });
  await worker.process(Buffer.from('private malformed content'), transport);
  assert.deepEqual(
    transport.events.map(({ type }) => type),
    ['failure', 'ack'],
  );
  assert.equal(transport.events[0].value.error, JOB_ERROR.INVALID);
  assert.match(transport.events[0].value.contentSha256, /^[a-f0-9]{64}$/);
  assert.equal(
    JSON.stringify(transport.events).includes('private malformed content'),
    false,
  );
});

test('failed retry publication leaves source unacknowledged', async () => {
  const transport = createTransport();
  transport.publishRetry = async () => {
    throw new Error('retry queue unavailable');
  };
  const worker = new WorkerService(failingJobs(new Error('transient failure')));
  await assert.rejects(
    worker.process(encode(job), transport),
    /retry queue unavailable/,
  );
  assert.deepEqual(transport.events, []);
});

test('failed invalid-envelope quarantine leaves source unacknowledged', async () => {
  const transport = createTransport();
  transport.publishFailure = async () => {
    throw new Error('quarantine unavailable');
  };
  const worker = new WorkerService({
    execute: async () => assert.fail('invalid job executed'),
  });
  await assert.rejects(
    worker.process(Buffer.from('{'), transport),
    /quarantine unavailable/,
  );
  assert.deepEqual(transport.events, []);
});
