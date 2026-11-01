import { ForbiddenException } from '@nestjs/common';
import { PermissionType } from '@Constants/authorization.constant';
import { IAuthorizedUser } from '@Interfaces/authorized-user.interface';

export const hasPermission = (
  user: IAuthorizedUser | null,
  permission: PermissionType,
): boolean => user?.permissions?.includes(permission) ?? false;

export const assertPermissions = (
  user: IAuthorizedUser | null,
  ...permissions: PermissionType[]
): void => {
  if (!permissions.every((permission) => hasPermission(user, permission))) {
    throw new ForbiddenException(
      'You do not have permission to perform this action',
    );
  }
};
