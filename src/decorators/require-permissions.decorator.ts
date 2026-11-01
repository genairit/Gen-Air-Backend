import { SetMetadata } from '@nestjs/common';
import { METADATA_KEYS } from '@Constants/metadata-keys';
import { PermissionType } from '@Constants/authorization.constant';

export const RequirePermissions = (...permissions: PermissionType[]) =>
  SetMetadata(METADATA_KEYS.PERMISSIONS, permissions);
