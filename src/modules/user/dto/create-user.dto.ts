import {
  IsIn,
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
  IsNotEmpty,
  IsPhoneNumber,
} from 'class-validator';

import {
  USER_ROLE_VALUES,
  type UserRoleType,
} from '@Constants/user-role.constant';

import { FIELD_LENGTHS } from '@Constants/field-length.constant';

export class CreateUserDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(FIELD_LENGTHS.USER_NAME)
  declare firstName: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(FIELD_LENGTHS.USER_NAME)
  declare lastName: string;

  @IsNotEmpty()
  @IsEmail()
  @MaxLength(FIELD_LENGTHS.EMAIL)
  declare email: string;

  @IsNotEmpty()
  @IsPhoneNumber('IL')
  @MaxLength(FIELD_LENGTHS.PHONE)
  declare phone: string;

  @IsNotEmpty()
  @IsIn(USER_ROLE_VALUES)
  declare role: UserRoleType;

  @IsNotEmpty()
  @IsString()
  @MinLength(FIELD_LENGTHS.PASSWORD_MIN)
  @MaxLength(FIELD_LENGTHS.PASSWORD_MAX)
  declare password: string;
}
