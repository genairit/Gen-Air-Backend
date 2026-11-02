import { UserRoleType } from '@Constants/user-role.constant';
import { IUser } from '@Modules/user/interfaces/user.interface';
import { PermissionType } from '@Constants/authorization.constant';

export interface IAuthorizedUser extends IUser {
  assignedRoles: UserRoleType[];
  permissions: PermissionType[];
}
