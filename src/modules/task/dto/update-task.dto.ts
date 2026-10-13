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
  @ValidateIf((object) => 'projectId' in object)
  @IsUUID()
  declare projectId?: string;
  @ValidateIf((object) => 'customerId' in object)
  @IsUUID()
  declare customerId?: string;
  @ValidateIf((object) => 'title' in object)
  @IsString()
  @MaxLength(FIELD_LENGTHS.TASK_TITLE)
  @Matches(/\S/)
  declare title?: string;
  @IsOptional()
  @IsUUID()
  declare assigneeId?: string | null;
  @IsOptional()
  @IsString()
  @MaxLength(FIELD_LENGTHS.TASK_DESCRIPTION)
  declare description?: string | null;
  @IsOptional()
  @IsDateString()
  declare dueDate?: string | null;
}
