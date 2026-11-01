import {
  PermissionType,
  PERMISSION_VALUES,
} from '@Constants/authorization.constant';

import { Injectable } from '@nestjs/common';
import { UserRoleType } from '@Constants/user-role.constant';
import { RolePermissionRepository } from './role-permission.repository';

@Injectable()
export class RolePermissionService {
  constructor(private readonly repository: RolePermissionRepository) {}

  async getPermissions(role: UserRoleType): Promise<PermissionType[]> {
    const grantedKeys = await this.repository.findKeysByRole(role);

    return PERMISSION_VALUES.filter((permission) =>
      grantedKeys.includes(permission),
    );
  }
}
