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
  IUserRoleAudit,
  TUserRoleAuditCreationAttributes,
} from '../interfaces/user-role-audit.interface';

import { User } from '@Modules/user/entities/user.entity';
import { USER_ROLE_AUDIT_ACTIONS } from '../constants/user-role-audit.constant';

@Table({
  updatedAt: false,
  tableName: 'user_role_audits',
  indexes: [
    {
      name: 'idx_user_role_audits_subject_created',
      fields: ['subject_user_id', 'created_at'],
    },
    {
      name: 'idx_user_role_audits_actor_created',
      fields: ['actor_id', 'created_at'],
    },
  ],
})
export class UserRoleAudit
  extends Model<IUserRoleAudit, TUserRoleAuditCreationAttributes>
  implements IUserRoleAudit
{
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => User)
  @Column({ allowNull: false, type: DataType.UUID })
  declare actorId: string;

  @Column({ allowNull: false, type: DataType.ENUM(...USER_ROLE_VALUES) })
  declare actorRole: UserRoleType;

  @ForeignKey(() => User)
  @Column({ allowNull: false, type: DataType.UUID })
  declare subjectUserId: string;

  @Column({
    allowNull: false,
    type: DataType.STRING(20),
  })
  declare action: (typeof USER_ROLE_AUDIT_ACTIONS)[keyof typeof USER_ROLE_AUDIT_ACTIONS];

  @Column(DataType.ENUM(...USER_ROLE_VALUES))
  declare previousRole: UserRoleType | null;

  @Column(DataType.ENUM(...USER_ROLE_VALUES))
  declare nextRole: UserRoleType | null;

  @Column({ allowNull: false, type: DataType.JSONB })
  declare previousAssignedRoles: UserRoleType[];

  @Column({ allowNull: false, type: DataType.JSONB })
  declare nextAssignedRoles: UserRoleType[];

  @CreatedAt
  declare createdAt: Date;
}
