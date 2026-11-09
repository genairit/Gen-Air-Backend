import { USER_ROLES } from '@Constants/user-role.constant';
import { TUserRoleCounts } from '../interfaces/user.interface';

export const USER_ROLE_LOCK_KEYS = {
  SYSTEM_ADMIN_MEMBERSHIP: 'user-role-system-admin-membership',
} as const;

export const EMPTY_USER_ROLE_COUNTS: TUserRoleCounts = {
  total: 0,
  [USER_ROLES.FINANCE]: 0,
  [USER_ROLES.ENGINEER]: 0,
  [USER_ROLES.INSTALLER]: 0,
  [USER_ROLES.SECRETARY]: 0,
  [USER_ROLES.SYSTEM_ADMIN]: 0,
  [USER_ROLES.PROJECT_MANAGER]: 0,
  [USER_ROLES.PURCHASING_EXECUTION_MANAGER]: 0,
};
