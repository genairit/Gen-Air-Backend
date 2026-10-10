import { SetMetadata } from '@nestjs/common';
import { METADATA_KEYS } from '@Constants/metadata-keys';
import { UserRoleType } from '@Constants/user-role.constant';

export const UserRoles = (roles: readonly UserRoleType[]) =>
  SetMetadata(METADATA_KEYS.USER_ROLES, roles);
