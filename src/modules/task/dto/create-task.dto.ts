import {
  IsUUID,
  Matches,
  IsString,
  MaxLength,
  IsOptional,
  IsNotEmpty,
  IsDateString,
} from 'class-validator';

import { FIELD_LENGTHS } from '@Constants/field-length.constant';

export class CreateTaskDto {
  @IsOptional()
  @IsUUID()
  declare projectId?: string | null;
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
  @IsNotEmpty()
  @IsDateString({ strict: true })
  declare dueDate: string;
}
