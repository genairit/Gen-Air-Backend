import { IsIn, IsNotEmpty } from 'class-validator';
import type { UserRoleType } from '@Constants/user-role.constant';
import { ASSIGNABLE_USER_ROLE_VALUES } from '@Constants/user-role.constant';

export class SwitchUserRoleDto {
  @IsNotEmpty()
  @IsIn(ASSIGNABLE_USER_ROLE_VALUES)
  declare role: UserRoleType;
}
