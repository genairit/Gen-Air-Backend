import {
  IsEmail,
  IsString,
  MaxLength,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
} from 'class-validator';

import { FIELD_LENGTHS } from '@Constants/field-length.constant';

export class LoginDto {
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(FIELD_LENGTHS.EMAIL)
  declare email: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(FIELD_LENGTHS.PASSWORD_MAX)
  declare password: string;

  @IsOptional()
  @IsBoolean()
  declare rememberMe?: boolean;
}
