import { Injectable } from '@nestjs/common';
import { UserRoleType } from '@Constants/user-role.constant';
import { RolePermission } from './entities/role-permission.entity';

@Injectable()
export class RolePermissionRepository {
  async findKeysByRole(role: UserRoleType): Promise<string[]> {
    const grants = await RolePermission.findAll({
      where: { role },
      attributes: ['permissionKey'],
      order: [['permissionKey', 'ASC']],
    });

    return grants.map((grant) => grant.permissionKey);
  }
}
