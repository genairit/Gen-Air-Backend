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
  IProjectStageTransition,
  TProjectStageTransitionCreationAttributes,
} from '../interfaces/project-stage-transition.interface';

import { User } from '@Modules/user/entities/user.entity';
import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { Project } from '@Modules/project/entities/project.entity';
import { ProjectStage } from '@Modules/project-stage/entities/project-stage.entity';

@Table({
  tableName: 'project_stage_transitions',
  indexes: [
    {
      fields: ['project_id', 'created_at'],
      name: 'idx_project_stage_transitions_project_created',
    },
  ],
})
export class ProjectStageTransition
  extends Model<
    IProjectStageTransition,
    TProjectStageTransitionCreationAttributes
  >
  implements IProjectStageTransition
{
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => Project)
  @Column({ allowNull: false, type: DataType.UUID })
  declare projectId: string;

  @ForeignKey(() => ProjectStage)
  @Column(DataType.UUID)
  declare fromStageId: string | null;

  @ForeignKey(() => ProjectStage)
  @Column({ allowNull: false, type: DataType.UUID })
  declare toStageId: string;

  @ForeignKey(() => User)
  @Column({ allowNull: false, type: DataType.UUID })
  declare changedById: string;

  @Column({ allowNull: false, type: DataType.ENUM(...USER_ROLE_VALUES) })
  declare changedByRole: UserRoleType;

  @Column(DataType.STRING(FIELD_LENGTHS.TRANSITION_NOTE))
  declare note: string | null;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BelongsTo(() => ProjectStage, 'fromStageId')
  declare fromStage?: ProjectStage;

  @BelongsTo(() => ProjectStage, 'toStageId')
  declare toStage?: ProjectStage;

  @BelongsTo(() => User, 'changedById')
  declare changedBy?: User;
}
