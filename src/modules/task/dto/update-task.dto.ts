import {
  IsUUID,
  Matches,
  IsString,
  MaxLength,
  IsOptional,
  ValidateIf,
  IsDateString,
} from 'class-validator';

import { FIELD_LENGTHS } from '@Constants/field-length.constant';

export class UpdateTaskDto {
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

  @ValidateIf((object) => 'dueDate' in object)
  @IsDateString({ strict: true })
  declare dueDate?: string;
}
