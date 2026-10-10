import {
  IsUUID,
  IsString,
  MaxLength,
  IsNotEmpty,
  IsOptional,
} from 'class-validator';

import { FIELD_LENGTHS } from '@Constants/field-length.constant';

export class MoveProjectDto {
  @IsNotEmpty()
  @IsUUID()
  declare stageId: string;

  @IsOptional()
  @IsString()
  @MaxLength(FIELD_LENGTHS.TRANSITION_NOTE)
  declare note?: string;
}
