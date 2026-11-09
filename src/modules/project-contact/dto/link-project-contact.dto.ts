import {
  IsUUID,
  IsString,
  IsBoolean,
  MaxLength,
  IsOptional,
} from 'class-validator';

import { FIELD_LENGTHS } from '@Constants/field-length.constant';

export class LinkProjectContactDto {
  @IsUUID()
  declare contactId: string;

  @IsOptional()
  @IsString()
  @MaxLength(FIELD_LENGTHS.CONTACT_ROLE)
  declare role?: string | null;

  @IsOptional()
  @IsBoolean()
  declare isPrimary?: boolean;
}
