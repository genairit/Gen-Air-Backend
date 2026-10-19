import { USER_ROLES } from '@Constants/user-role.constant';
import { TUserRoleCounts } from '../interfaces/user.interface';

export const EMPTY_USER_ROLE_COUNTS: TUserRoleCounts = {
  [USER_ROLES.FINANCE]: 0,
  [USER_ROLES.ENGINEER]: 0,
  [USER_ROLES.INSTALLER]: 0,
  [USER_ROLES.SECRETARY]: 0,
  [USER_ROLES.SYSTEM_ADMIN]: 0,
  [USER_ROLES.PROJECT_MANAGER]: 0,
};
