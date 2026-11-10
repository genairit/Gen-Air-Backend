import { JobDto } from '../dto/job.dto.js';
import { validateSync } from 'class-validator';
import { JobError } from '../errors/job.error.js';
import { plainToInstance } from 'class-transformer';
import { WORKER, JOB_ERROR } from '../constants/worker.constant.js';

export const parseJob = (content: Buffer): JobDto => {
  if (content.length > WORKER.MAX_MESSAGE_BYTES) {
    throw new JobError(JOB_ERROR.INVALID, false);
  }

  const value: unknown = JSON.parse(content.toString('utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new JobError(JOB_ERROR.INVALID, false);
  }

  const job = plainToInstance(JobDto, value);
  const errors = validateSync(job, {
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
  });
  if (errors.length > 0) {
    throw new JobError(JOB_ERROR.INVALID, false);
  }

  return job;
};

export const classifyJobError = (error: unknown): JobError => {
  if (error instanceof JobError) {
    return error;
  }

  return new JobError(JOB_ERROR.EXECUTION, true);
};
