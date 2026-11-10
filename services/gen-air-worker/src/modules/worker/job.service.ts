import { Injectable } from '@nestjs/common';
import { Worker } from 'node:worker_threads';
import { JobError } from '../../errors/job.error.js';
import { WORKER, JOB_ERROR } from '../../constants/worker.constant.js';
import type { IReportResult } from '../../interfaces/worker.interface.js';

@Injectable()
export class JobService {
  execute = async (payload: object): Promise<IReportResult> => {
    const worker = new Worker(new URL('./job.runner.js', import.meta.url), {
      workerData: payload,
      resourceLimits: { maxOldGenerationSizeMb: 128 },
    });
    const outcome = Promise.withResolvers<IReportResult>();
    const timeout = setTimeout(
      () => outcome.reject(new JobError(JOB_ERROR.TIMEOUT, true)),
      WORKER.JOB_TIMEOUT_MS,
    );
    worker.once('message', (value: unknown) => this.receive(value, outcome));
    worker.once('error', () =>
      outcome.reject(new JobError(JOB_ERROR.EXECUTION, true)),
    );
    worker.once('exit', () =>
      outcome.reject(new JobError(JOB_ERROR.EXECUTION, true)),
    );
    try {
      return await outcome.promise;
    } finally {
      clearTimeout(timeout);
      await worker.terminate();
    }
  };

  private receive = (
    value: unknown,
    outcome: PromiseWithResolvers<IReportResult>,
  ): void => {
    if (!value || typeof value !== 'object') {
      outcome.reject(new JobError(JOB_ERROR.EXECUTION, true));
      return;
    }

    if ('error' in value && typeof value.error === 'string') {
      const retryable = 'retryable' in value && value.retryable === true;
      outcome.reject(new JobError(value.error, retryable));
      return;
    }

    if ('output' in value && this.isReportResult(value.output)) {
      outcome.resolve(value.output);
      return;
    }

    outcome.reject(new JobError(JOB_ERROR.EXECUTION, true));
  };

  private isReportResult = (value: unknown): value is IReportResult => {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const hasCsv = 'csv' in value && typeof value.csv === 'string';
    const hasRowCount =
      'rowCount' in value && typeof value.rowCount === 'number';
    const hasContentType =
      'contentType' in value && typeof value.contentType === 'string';
    return hasCsv && hasRowCount && hasContentType;
  };
}
