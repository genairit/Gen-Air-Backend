import {
  IsIn,
  IsUUID,
  Matches,
  IsString,
  MaxLength,
  IsOptional,
  IsNotEmpty,
  IsDateString,
} from 'class-validator';

import type { TaskType } from '../constants/task-type.constant';
import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { TASK_TYPE_VALUES } from '../constants/task-type.constant';

export class CreateTaskDto {
  @IsOptional()
  @IsIn(TASK_TYPE_VALUES)
  declare taskType?: TaskType;

  @IsNotEmpty()
  @IsUUID()
  declare projectId: string;
  @IsOptional()
  @IsUUID()
  declare customerId?: string | null;
  @IsNotEmpty()
  @IsString()
  @MaxLength(FIELD_LENGTHS.TASK_TITLE)
  @Matches(/\S/)
  declare title: string;
  @IsOptional()
  @IsUUID()
  declare assigneeId?: string | null;
  @IsNotEmpty()
  @IsString()
  @Matches(/\S/)
  @MaxLength(FIELD_LENGTHS.TASK_DESCRIPTION)
  declare description: string;
  @IsOptional()
  @IsDateString({ strict: true })
  declare dueDate?: string | null;
}
