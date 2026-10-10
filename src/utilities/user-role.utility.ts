import { USER_ROLE_VALUES, UserRoleType } from '@Constants/user-role.constant';

export const isUserRole = (value: unknown): value is UserRoleType =>
  USER_ROLE_VALUES.some((role) => role === value);
