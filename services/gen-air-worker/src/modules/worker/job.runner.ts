import { parentPort, workerData } from 'node:worker_threads';
import { renderReport } from '../../handlers/report.handler.js';
import { classifyJobError } from '../../utilities/job.utility.js';

try {
  const payload: unknown = workerData;
  parentPort?.postMessage({ output: renderReport(payload) });
} catch (error) {
  const failure = classifyJobError(error);
  parentPort?.postMessage({
    error: failure.code,
    retryable: failure.retryable,
  });
}
