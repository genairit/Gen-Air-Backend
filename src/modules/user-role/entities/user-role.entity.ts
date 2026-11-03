import {
  Table,
  Model,
  Column,
  Default,
  DataType,
  CreatedAt,
  ForeignKey,
  PrimaryKey,
} from 'sequelize-typescript';

import {
  USER_ROLE_VALUES,
  type UserRoleType,
} from '@Constants/user-role.constant';

import {
  IUserRole,
  TUserRoleCreationAttributes,
} from '../interfaces/user-role.interface';

import { User } from '@Modules/user/entities/user.entity';

@Table({
  updatedAt: false,
  tableName: 'user_roles',
  indexes: [
    { name: 'idx_user_roles_user_id', fields: ['user_id'] },
    {
      name: 'uq_user_roles_user_id_role',
      fields: ['user_id', 'role'],
      unique: true,
    },
    { name: 'idx_user_roles_role_user_id', fields: ['role', 'user_id'] },
  ],
})
export class UserRole
  extends Model<IUserRole, TUserRoleCreationAttributes>
  implements IUserRole
{
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => User)
  @Column({ allowNull: false, type: DataType.UUID })
  declare userId: string;

  @Column({ allowNull: false, type: DataType.ENUM(...USER_ROLE_VALUES) })
  declare role: UserRoleType;

  @CreatedAt
  declare createdAt: Date;
}
