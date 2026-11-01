import {
  Table,
  Model,
  Column,
  DataType,
  ForeignKey,
  PrimaryKey,
} from 'sequelize-typescript';

import {
  USER_ROLE_VALUES,
  type UserRoleType,
} from '@Constants/user-role.constant';

import { IRolePermission } from '../interfaces/role-permission.interface';
import { Permission } from '@Modules/permission/entities/permission.entity';

@Table({ tableName: 'role_permissions', timestamps: false })
export class RolePermission
  extends Model<IRolePermission>
  implements IRolePermission
{
  @PrimaryKey
  @Column({ allowNull: false, type: DataType.ENUM(...USER_ROLE_VALUES) })
  declare role: UserRoleType;

  @PrimaryKey
  @ForeignKey(() => Permission)
  @Column({ allowNull: false, type: DataType.TEXT })
  declare permissionKey: string;
}
