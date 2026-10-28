import { IUser } from '@Modules/user/interfaces/user.interface';
import { PermissionType } from '@Constants/authorization.constant';

export interface IAuthorizedUser extends IUser {
  permissions: PermissionType[];
}
