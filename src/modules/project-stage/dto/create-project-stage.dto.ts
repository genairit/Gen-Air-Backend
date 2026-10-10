import {
  IsString,
  MaxLength,
  IsHexColor,
  IsNotEmpty,
  IsOptional,
} from 'class-validator';

import { FIELD_LENGTHS } from '@Constants/field-length.constant';

export class CreateProjectStageDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(FIELD_LENGTHS.STAGE_NAME)
  declare name: string;

  @IsOptional()
  @IsString()
  @MaxLength(FIELD_LENGTHS.STAGE_DESCRIPTION)
  declare description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(FIELD_LENGTHS.STAGE_TAG)
  declare tag?: string;

  @IsOptional()
  @IsHexColor()
  @MaxLength(FIELD_LENGTHS.HEX_COLOR)
  declare color?: string;
}
