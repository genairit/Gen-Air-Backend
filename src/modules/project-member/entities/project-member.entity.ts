import {
  Table,
  Model,
  Column,
  Default,
  DataType,
  BelongsTo,
  CreatedAt,
  UpdatedAt,
  ForeignKey,
  PrimaryKey,
} from 'sequelize-typescript';

import {
  USER_ROLE_VALUES,
  type UserRoleType,
} from '@Constants/user-role.constant';

import {
  IProjectMember,
  TProjectMemberCreationAttributes,
} from '../interfaces/project-member.interface';

import { User } from '@Modules/user/entities/user.entity';
import { Project } from '@Modules/project/entities/project.entity';

@Table({
  tableName: 'project_members',
  indexes: [
    { name: 'idx_project_members_user_id', fields: ['user_id'] },
    {
      unique: true,
      fields: ['project_id', 'role'],
      name: 'uq_project_members_project_role',
    },
  ],
})
export class ProjectMember
  extends Model<IProjectMember, TProjectMemberCreationAttributes>
  implements IProjectMember
{
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => Project)
  @Column({ allowNull: false, type: DataType.UUID })
  declare projectId: string;

  @ForeignKey(() => User)
  @Column({ allowNull: false, type: DataType.UUID })
  declare userId: string;

  @Column({ allowNull: false, type: DataType.ENUM(...USER_ROLE_VALUES) })
  declare role: UserRoleType;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BelongsTo(() => User)
  declare user?: User;
}
