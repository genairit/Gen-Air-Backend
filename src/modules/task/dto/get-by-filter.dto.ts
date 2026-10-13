import {
  TASK_STATUS_VALUES,
  type TaskStatusType,
} from '../constants/task-status.constant';

import { Transform } from 'class-transformer';
import { CursorPaginationDto } from '@Dto/cursor-pagination.dto';
import { toTaskUrgencyFilter } from '../utilities/task-query.utility';
import { IsOptional, IsUUID, IsIn, IsBoolean } from 'class-validator';

export class GetTasksByFilterDto extends CursorPaginationDto {
  @IsOptional() @IsUUID() declare assigneeId?: string;
  @IsOptional() @IsUUID() declare projectId?: string;
  @IsOptional() @IsUUID() declare customerId?: string;
  @IsOptional() @IsIn(TASK_STATUS_VALUES) declare status?: TaskStatusType;
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toTaskUrgencyFilter(value))
  @IsBoolean()
  declare isUrgent?: boolean;
}
