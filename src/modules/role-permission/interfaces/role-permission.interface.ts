import { UserRoleType } from '@Constants/user-role.constant';

export interface IRolePermission {
  role: UserRoleType;
  permissionKey: string;
}
