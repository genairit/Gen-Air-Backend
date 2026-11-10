import {
  WORKER,
  JOB_ERROR,
  JOB_STATUS,
} from '../../constants/worker.constant.js';

import type {
  IJobResult,
  IJobOutcome,
  IJobTransport,
} from '../../interfaces/worker.interface.js';

import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JobService } from './job.service.js';
import { JobDto } from '../../dto/job.dto.js';
import { setTimeout as delay } from 'node:timers/promises';
import { TypedLogger } from '../../logger/logger.service.js';
import { parseJob, classifyJobError } from '../../utilities/job.utility.js';

@Injectable()
export class WorkerService {
  private readonly logger = new TypedLogger(WorkerService.name);

  constructor(private readonly jobs: JobService) {}

  process = async (
    content: Buffer,
    transport: IJobTransport,
  ): Promise<void> => {
    const job = this.readJob(content);
    if (!job) {
      await transport.publishFailure({
        version: WORKER.VERSION,
        error: JOB_ERROR.INVALID,
        contentSha256: createHash('sha256').update(content).digest('hex'),
      });
      transport.acknowledge();
      this.logger.warn({ message: 'Invalid job quarantined' });
      return;
    }

    const result = await this.execute(job);
    if (result.error && result.retryable && job.attempt < WORKER.MAX_ATTEMPTS) {
      await delay(WORKER.RETRY_DELAY_MS * job.attempt);
      await transport.publishRetry({ ...job, attempt: job.attempt + 1 });
      transport.acknowledge();
      this.logger.warn({
        message: 'Job retry scheduled',
        jobId: job.jobId,
        attempt: job.attempt,
      });
      return;
    }

    const terminal: IJobResult = {
      version: WORKER.VERSION,
      jobId: job.jobId,
      tenantId: job.tenantId,
      jobType: job.jobType,
      attempt: job.attempt,
      completedAt: new Date().toISOString(),
      status: result.error ? JOB_STATUS.FAILED : JOB_STATUS.SUCCEEDED,
      output: result.output,
      error: result.error,
    };
    await transport.publishResult(terminal);
    if (result.error) {
      await transport.publishFailure({ job, result: terminal });
    }

    transport.acknowledge();
    this.logger.info({
      message: 'Job completed',
      jobId: job.jobId,
      status: terminal.status,
    });
  };

  private readJob = (content: Buffer): JobDto | null => {
    try {
      return parseJob(content);
    } catch {
      return null;
    }
  };

  private execute = async (job: JobDto): Promise<IJobOutcome> => {
    try {
      const output = await this.jobs.execute(job.payload);
      return { output, error: null, retryable: false };
    } catch (error) {
      const failure = classifyJobError(error);
      return {
        output: null,
        error: failure.code,
        retryable: failure.retryable,
      };
    }
  };
}
