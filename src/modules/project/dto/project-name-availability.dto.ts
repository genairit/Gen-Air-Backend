import {
  IsUUID,
  IsString,
  MaxLength,
  IsNotEmpty,
  IsOptional,
} from 'class-validator';

import { Transform } from 'class-transformer';
import { FIELD_LENGTHS } from '@Constants/field-length.constant';

export class ProjectNameAvailabilityDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(FIELD_LENGTHS.PROJECT_NAME)
  declare name: string;

  @IsOptional()
  @IsUUID()
  declare excludeId?: string;
}
