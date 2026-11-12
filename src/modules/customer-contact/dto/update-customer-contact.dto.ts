import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  ValidateIf,
} from 'class-validator';

import { Trim } from '@Decorators/trim.decorator';
import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { NullIfBlank } from '@Decorators/null-if-blank.decorator';
import { IsDialablePhone } from '@Decorators/is-dialable-phone.decorator';

export class UpdateCustomerContactDto {
  @Trim()
  @ValidateIf((input: object) => Reflect.has(input, 'name'))
  @IsString()
  @MinLength(FIELD_LENGTHS.CONTACT_NAME_MIN)
  @MaxLength(FIELD_LENGTHS.CUSTOMER_NAME)
  declare name?: string;

  @Trim()
  @NullIfBlank()
  @IsOptional()
  @IsDialablePhone()
  @MaxLength(FIELD_LENGTHS.PHONE)
  declare phone?: string | null;

  @Trim()
  @IsOptional()
  @IsEmail()
  @MaxLength(FIELD_LENGTHS.EMAIL)
  declare email?: string | null;

  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(FIELD_LENGTHS.CONTACT_ROLE)
  declare role?: string | null;
}
