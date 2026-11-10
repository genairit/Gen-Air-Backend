import {
  IsUUID,
  IsString,
  MaxLength,
  IsNotEmpty,
  IsOptional,
} from 'class-validator';

import { Trim } from '@Decorators/trim.decorator';
import { FIELD_LENGTHS } from '@Constants/field-length.constant';

export class MoveProjectDto {
  @IsNotEmpty()
  @IsUUID()
  declare stageId: string;

  @IsOptional()
  @IsString()
  @Trim()
  @MaxLength(FIELD_LENGTHS.TRANSITION_NOTE)
  declare note?: string;
}
