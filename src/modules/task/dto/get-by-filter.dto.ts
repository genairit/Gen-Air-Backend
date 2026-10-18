import {
  Min,
  Max,
  IsInt,
  IsString,
  MaxLength,
  ValidateBy,
} from 'class-validator';

import {
  TASK_STATUS_VALUES,
  type TaskStatusType,
} from '../constants/task-status.constant';

import { Type } from 'class-transformer';
import { Transform } from 'class-transformer';
import { PAGINATION } from '@Constants/pagination.constant';
import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { decodeTaskCursor } from '../utilities/task-cursor.utility';
import { toTaskUrgencyFilter } from '../utilities/task-query.utility';
import { IsOptional, IsUUID, IsIn, IsBoolean } from 'class-validator';

export class GetTasksByFilterDto {
  @IsOptional()
  @IsString()
  @ValidateBy({
    name: 'taskCursor',
    validator: {
      validate: (value: unknown) =>
        typeof value === 'string' && decodeTaskCursor(value) !== null,
      defaultMessage: () =>
        'batchCursor must be a task cursor returned by a previous page',
    },
  })
  declare batchCursor?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGINATION.MAX_BATCH_SIZE)
  declare batchSize?: number;
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toTaskUrgencyFilter(value))
  @IsBoolean()
  declare unassigned?: boolean;
  @IsOptional()
  @IsString()
  @MaxLength(FIELD_LENGTHS.SEARCH_QUERY)
  declare search?: string;
  @IsOptional() @IsUUID() declare assigneeId?: string;
  @IsOptional() @IsUUID() declare projectId?: string;
  @IsOptional() @IsUUID() declare customerId?: string;
  @IsOptional() @IsIn(TASK_STATUS_VALUES) declare status?: TaskStatusType;
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toTaskUrgencyFilter(value))
  @IsBoolean()
  declare isUrgent?: boolean;
}
