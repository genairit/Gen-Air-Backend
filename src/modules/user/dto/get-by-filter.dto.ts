import {
  USER_ROLE_VALUES,
  type UserRoleType,
} from '@Constants/user-role.constant';

import { CursorPaginationDto } from '@Dto/cursor-pagination.dto';
import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { IsIn, IsString, MaxLength, IsOptional } from 'class-validator';

export class GetUsersByFilterDto extends CursorPaginationDto {
  @IsOptional()
  @IsString()
  @MaxLength(FIELD_LENGTHS.SEARCH_QUERY)
  declare search?: string;

  @IsOptional()
  @IsIn(USER_ROLE_VALUES)
  declare role?: UserRoleType;
}
