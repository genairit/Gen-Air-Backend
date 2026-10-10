import {
  IsIn,
  IsEmail,
  IsString,
  MaxLength,
  IsOptional,
  IsNotEmpty,
  IsPhoneNumber,
} from 'class-validator';

import {
  USER_ROLE_VALUES,
  type UserRoleType,
} from '@Constants/user-role.constant';

import { FIELD_LENGTHS } from '@Constants/field-length.constant';

export class UpdateUserDto {
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  @MaxLength(FIELD_LENGTHS.USER_NAME)
  declare firstName?: string;

  @IsOptional()
  @IsNotEmpty()
  @IsString()
  @MaxLength(FIELD_LENGTHS.USER_NAME)
  declare lastName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(FIELD_LENGTHS.EMAIL)
  declare email?: string;

  @IsOptional()
  @IsPhoneNumber('IL')
  @MaxLength(FIELD_LENGTHS.PHONE)
  declare phone?: string;

  @IsOptional()
  @IsIn(USER_ROLE_VALUES)
  declare role?: UserRoleType;
}
