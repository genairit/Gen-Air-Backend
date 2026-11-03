import { IsIn, IsNotEmpty } from 'class-validator';
import { USER_ROLE_VALUES } from '@Constants/user-role.constant';
import type { UserRoleType } from '@Constants/user-role.constant';

export class SwitchUserRoleDto {
  @IsNotEmpty()
  @IsIn(USER_ROLE_VALUES)
  declare role: UserRoleType;
}
