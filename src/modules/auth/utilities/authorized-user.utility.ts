import { IUser } from '@Modules/user/interfaces/user.interface';
import { PermissionType } from '@Constants/authorization.constant';
import { IAuthorizedUser } from '@Interfaces/authorized-user.interface';

export const toAuthorizedUser = (
  user: IUser,
  permissions: PermissionType[],
): IAuthorizedUser => ({
  id: user.id,
  role: user.role,
  email: user.email,
  phone: user.phone,
  firstName: user.firstName,
  lastName: user.lastName,
  employeeNumber: user.employeeNumber,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
  deletedAt: user.deletedAt,
  permissions,
});
