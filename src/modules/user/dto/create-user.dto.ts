import {
  IsIn,
  IsEmail,
  IsArray,
  IsString,
  MaxLength,
  MinLength,
  IsNotEmpty,
  ArrayUnique,
  ArrayNotEmpty,
} from 'class-validator';

import {
  USER_ROLE_VALUES,
  type UserRoleType,
} from '@Constants/user-role.constant';

import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { IsDialablePhone } from '@Decorators/is-dialable-phone.decorator';

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
  @IsDialablePhone()
  @MaxLength(FIELD_LENGTHS.PHONE)
  declare phone: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsIn(USER_ROLE_VALUES, { each: true })
  declare assignedRoles: UserRoleType[];

  @IsNotEmpty()
  @IsString()
  @MinLength(FIELD_LENGTHS.PASSWORD_MIN)
  @MaxLength(FIELD_LENGTHS.PASSWORD_MAX)
  declare password: string;
}
