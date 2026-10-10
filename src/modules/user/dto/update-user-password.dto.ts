import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { IsString, MaxLength, MinLength, IsNotEmpty } from 'class-validator';

export class UpdateUserPasswordDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(FIELD_LENGTHS.PASSWORD_MIN)
  @MaxLength(FIELD_LENGTHS.PASSWORD_MAX)
  declare password: string;
}
