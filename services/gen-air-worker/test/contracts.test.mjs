import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { JobError } from '../dist/errors/job.error.js';
import { parseJob } from '../dist/utilities/job.utility.js';
import { renderReport } from '../dist/handlers/report.handler.js';
import { JobService } from '../dist/modules/worker/job.service.js';
import { WORKER, JOB_ERROR } from '../dist/constants/worker.constant.js';

const validJob = {
  version: WORKER.VERSION,
  jobId: 'job_1',
  tenantId: 'tenant-1',
  jobType: WORKER.JOB_TYPE,
  attempt: 1,
  payload: { headers: ['Name'], rows: [['Alice']] },
};
const encode = (value) => Buffer.from(JSON.stringify(value));
const invalidJob = (error) =>
  error instanceof JobError &&
  error.code === JOB_ERROR.INVALID &&
  !error.retryable;

test('parseJob accepts the versioned tenant-scoped envelope', () => {
  assert.deepEqual({ ...parseJob(encode(validJob)) }, validJob);
});

test('parseJob rejects malformed, oversized and non-object input', () => {
  assert.throws(() => parseJob(Buffer.from('{')));
  assert.throws(
    () => parseJob(Buffer.alloc(WORKER.MAX_MESSAGE_BYTES + 1)),
    invalidJob,
  );
  [null, [], 1, 'job'].forEach((value) =>
    assert.throws(() => parseJob(encode(value)), invalidJob),
  );
});

test('parseJob rejects invalid contracts, extra fields and retry overflow', () => {
  const invalid = [
    { version: 2 },
    { jobId: '' },
    { tenantId: '../tenant' },
    { jobType: 'unsupported' },
    { attempt: 0 },
    { attempt: 1.5 },
    { attempt: WORKER.MAX_ATTEMPTS + 1 },
    { payload: [] },
    { payload: null },
    { extra: true },
    { jobId: 'x'.repeat(129) },
  ];
  invalid.forEach((patch) =>
    assert.throws(
      () => parseJob(encode({ ...validJob, ...patch })),
      invalidJob,
    ),
  );
  Object.keys(validJob).forEach((key) => {
    const missing = Object.fromEntries(
      Object.entries(validJob).filter(([field]) => field !== key),
    );
    assert.throws(() => parseJob(encode(missing)), invalidJob);
  });
});

test('renderReport quotes commas, quotes and newlines and neutralizes formulas', () => {
  const result = renderReport({
    headers: ['=HEADER', 'Value'],
    rows: [
      ['Alice, Bob', 'a"b\nc'],
      ['=1+1', '+1'],
      ['-1', '@SUM(A1)'],
      [' \t=1', '\uFEFF=2'],
    ],
  });
  assert.equal(result.rowCount, 4);
  assert.equal(result.contentType, 'text/csv; charset=utf-8');
  assert.equal(
    result.csv,
    '"\'=HEADER","Value"\r\n"Alice, Bob","a""b\nc"\r\n"\'=1+1","\'+1"\r\n"\'-1","\'@SUM(A1)"\r\n"\' \t=1","\'\uFEFF=2"\r\n',
  );
});

test('renderReport enforces payload shape and row, column and cell limits', () => {
  const invalid = [
    null,
    {},
    { headers: [], rows: [] },
    { headers: ['x'], rows: [[1]] },
    { headers: ['x'], rows: [[]] },
    { headers: ['x'], rows: [['x', 'y']] },
    { headers: ['x'], rows: [], extra: true },
    { headers: Array(WORKER.MAX_COLUMNS + 1).fill('x'), rows: [] },
    { headers: ['x'], rows: Array(WORKER.MAX_ROWS + 1).fill(['x']) },
    { headers: ['x'], rows: [['x'.repeat(WORKER.MAX_CELL_LENGTH + 1)]] },
  ];
  invalid.forEach((payload) =>
    assert.throws(() => renderReport(payload), invalidJob),
  );
  assert.equal(
    renderReport({ headers: ['x'], rows: Array(WORKER.MAX_ROWS).fill(['x']) })
      .rowCount,
    WORKER.MAX_ROWS,
  );
  assert.equal(
    renderReport({ headers: Array(WORKER.MAX_COLUMNS).fill('x'), rows: [] })
      .rowCount,
    0,
  );
  assert.equal(
    renderReport({
      headers: ['x'],
      rows: [['x'.repeat(WORKER.MAX_CELL_LENGTH)]],
    }).rowCount,
    1,
  );
});

test('renderReport bounds serialized UTF-8 output', () => {
  const payload = {
    headers: ['x'],
    rows: Array(2000).fill(['界'.repeat(WORKER.MAX_CELL_LENGTH)]),
  };
  assert.throws(() => renderReport(payload), {
    code: JOB_ERROR.RESULT_TOO_LARGE,
    retryable: false,
  });
});

test('JobService executes the real isolated renderer and propagates validation failures', async () => {
  const jobs = new JobService();
  assert.deepEqual(
    await jobs.execute(validJob.payload),
    renderReport(validJob.payload),
  );
  await assert.rejects(jobs.execute({ headers: [], rows: [] }), invalidJob);
});
