import {
  IsIn,
  IsEmail,
  IsArray,
  IsString,
  MaxLength,
  IsOptional,
  IsNotEmpty,
  ArrayUnique,
  ArrayNotEmpty,
} from 'class-validator';

import {
  type UserRoleType,
  ASSIGNABLE_USER_ROLE_VALUES,
} from '@Constants/user-role.constant';

import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { IsDialablePhone } from '@Decorators/is-dialable-phone.decorator';

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
  @IsDialablePhone()
  @MaxLength(FIELD_LENGTHS.PHONE)
  declare phone?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsIn(ASSIGNABLE_USER_ROLE_VALUES, { each: true })
  declare assignedRoles?: UserRoleType[];
}
