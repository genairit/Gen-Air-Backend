import {
  Table,
  Model,
  Column,
  Default,
  DataType,
  CreatedAt,
  DeletedAt,
  UpdatedAt,
  PrimaryKey,
} from 'sequelize-typescript';

import {
  IProjectStage,
  TProjectStageCreationAttributes,
} from '../interfaces/project-stage.interface';

import { FIELD_LENGTHS } from '@Constants/field-length.constant';

@Table({
  tableName: 'project_stages',
  paranoid: true,
  indexes: [
    {
      unique: true,
      fields: ['position'],
      where: { deleted_at: null },
      name: 'uq_project_stages_position',
    },
  ],
})
export class ProjectStage
  extends Model<IProjectStage, TProjectStageCreationAttributes>
  implements IProjectStage
{
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ allowNull: false, type: DataType.STRING(FIELD_LENGTHS.STAGE_NAME) })
  declare name: string;

  @Column(DataType.STRING(FIELD_LENGTHS.STAGE_DESCRIPTION))
  declare description: string | null;

  @Column(DataType.STRING(FIELD_LENGTHS.STAGE_TAG))
  declare tag: string | null;

  @Column(DataType.STRING(FIELD_LENGTHS.HEX_COLOR))
  declare color: string | null;

  @Column({ allowNull: false, type: DataType.INTEGER })
  declare position: number;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @DeletedAt
  declare deletedAt: Date | null;
}
