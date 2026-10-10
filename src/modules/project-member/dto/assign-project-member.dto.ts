import {
  USER_ROLE_VALUES,
  type UserRoleType,
} from '@Constants/user-role.constant';

import { IsIn, IsUUID, IsNotEmpty } from 'class-validator';

export class AssignProjectMemberDto {
  @IsNotEmpty()
  @IsUUID()
  declare userId: string;

  @IsNotEmpty()
  @IsIn(USER_ROLE_VALUES)
  declare role: UserRoleType;
}
