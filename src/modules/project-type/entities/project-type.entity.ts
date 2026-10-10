import {
  Table,
  Model,
  Column,
  Default,
  DataType,
  CreatedAt,
  UpdatedAt,
  PrimaryKey,
} from 'sequelize-typescript';

import {
  type ProjectDetailFieldSetType,
  PROJECT_DETAIL_FIELD_SET_VALUES,
} from '@Constants/project-detail-field-set.constant';

import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { IProjectType } from '../interfaces/project-type.interface';

@Table({ tableName: 'project_types' })
export class ProjectType extends Model<IProjectType> implements IProjectType {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({
    unique: true,
    allowNull: false,
    type: DataType.STRING(FIELD_LENGTHS.PROJECT_TYPE_NAME),
  })
  declare name: string;

  @Column(DataType.STRING(FIELD_LENGTHS.PROJECT_TYPE_SUBTITLE))
  declare subtitle: string | null;

  @Column(DataType.STRING(FIELD_LENGTHS.PROJECT_TYPE_DESCRIPTION))
  declare description: string | null;

  @Column(DataType.STRING(FIELD_LENGTHS.PROJECT_TYPE_TAG))
  declare tag: string | null;

  @Column(DataType.STRING(FIELD_LENGTHS.ICON))
  declare icon: string | null;

  @Column({ allowNull: false, type: DataType.INTEGER })
  declare position: number;

  @Column({
    allowNull: false,
    type: DataType.ENUM(...PROJECT_DETAIL_FIELD_SET_VALUES),
  })
  declare detailFieldSet: ProjectDetailFieldSetType;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
