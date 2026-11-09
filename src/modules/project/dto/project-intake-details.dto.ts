import {
  Length,
  IsString,
  MaxLength,
  IsNotEmpty,
  IsOptional,
} from 'class-validator';

import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { NullIfBlank } from '@Decorators/null-if-blank.decorator';
import { IsDialablePhone } from '@Decorators/is-dialable-phone.decorator';
import { IsGooglePlaceId } from '@Decorators/is-google-place-id.decorator';

export class ProjectIntakeDetailsDto {
  @IsOptional()
  @IsGooglePlaceId()
  declare addressPlaceId?: string | null;

  @IsOptional()
  @IsString()
  @Length(FIELD_LENGTHS.CONTACT_NAME_MIN, FIELD_LENGTHS.CONTACT_NAME)
  declare contactName?: string | null;

  @IsOptional()
  @NullIfBlank()
  @IsString()
  @IsDialablePhone()
  declare contactPhone?: string | null;

  @IsOptional()
  @IsNotEmpty()
  @IsString()
  @MaxLength(FIELD_LENGTHS.CONTACT_ROLE)
  declare contactRole?: string | null;
}
