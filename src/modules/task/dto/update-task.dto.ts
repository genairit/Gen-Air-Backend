import {
  IsIn,
  IsUUID,
  Matches,
  IsString,
  MaxLength,
  IsOptional,
  ValidateIf,
  IsDateString,
} from 'class-validator';

import type { TaskType } from '../constants/task-type.constant';
import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { TASK_TYPE_VALUES } from '../constants/task-type.constant';

export class UpdateTaskDto {
  @IsOptional()
  @IsIn(TASK_TYPE_VALUES)
  declare taskType?: TaskType;

  @IsOptional()
  @IsUUID()
  declare projectId?: string | null;
  @IsOptional()
  @IsUUID()
  declare customerId?: string | null;
  @ValidateIf((object) => 'title' in object)
  @IsString()
  @MaxLength(FIELD_LENGTHS.TASK_TITLE)
  @Matches(/\S/)
  declare title?: string;
  @IsOptional()
  @IsUUID()
  declare assigneeId?: string | null;
  @ValidateIf((object) => 'description' in object)
  @IsString()
  @Matches(/\S/)
  @MaxLength(FIELD_LENGTHS.TASK_DESCRIPTION)
  declare description?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  declare dueDate?: string | null;
}
