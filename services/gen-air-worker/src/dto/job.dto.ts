import { WORKER } from '../constants/worker.constant.js';
import { Max, Min, Equals, IsInt, Matches, IsObject } from 'class-validator';

export class JobDto {
  @Equals(WORKER.VERSION)
  version!: number;

  @Matches(/^[a-zA-Z0-9_-]{1,128}$/)
  jobId!: string;

  @Matches(/^[a-zA-Z0-9_-]{1,128}$/)
  tenantId!: string;

  @Equals(WORKER.JOB_TYPE)
  jobType!: string;

  @IsInt()
  @Min(1)
  @Max(WORKER.MAX_ATTEMPTS)
  attempt!: number;

  @IsObject()
  payload!: object;
}
