import {
  Table,
  Model,
  Column,
  HasMany,
  Default,
  DataType,
  BelongsTo,
  CreatedAt,
  DeletedAt,
  UpdatedAt,
  ForeignKey,
  PrimaryKey,
} from 'sequelize-typescript';

import {
  IProject,
  TProjectCreationAttributes,
} from '../interfaces/project.interface';

import { User } from '@Modules/user/entities/user.entity';
import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { ProjectType } from '@Modules/project-type/entities/project-type.entity';
import { ProjectStage } from '@Modules/project-stage/entities/project-stage.entity';
import { ProjectMember } from '@Modules/project-member/entities/project-member.entity';

@Table({
  tableName: 'projects',
  paranoid: true,
  indexes: [
    {
      fields: ['stage_id'],
      where: { deleted_at: null },
      name: 'idx_projects_stage_id',
    },
    {
      fields: ['project_type_id'],
      where: { deleted_at: null },
      name: 'idx_projects_project_type_id',
    },
  ],
})
export class Project
  extends Model<IProject, TProjectCreationAttributes>
  implements IProject
{
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({
    unique: true,
    allowNull: false,
    type: DataType.STRING(FIELD_LENGTHS.PROJECT_CODE),
  })
  declare code: string;

  @Column({
    allowNull: false,
    type: DataType.STRING(FIELD_LENGTHS.PROJECT_NAME),
  })
  declare name: string;

  @ForeignKey(() => ProjectType)
  @Column({ allowNull: false, type: DataType.UUID })
  declare projectTypeId: string;

  @ForeignKey(() => ProjectStage)
  @Column({ allowNull: false, type: DataType.UUID })
  declare stageId: string;

  @ForeignKey(() => User)
  @Column({ allowNull: false, type: DataType.UUID })
  declare createdById: string;

  @Column(DataType.STRING(FIELD_LENGTHS.DRIVE_ID))
  declare driveFolderId: string | null;

  @Column(DataType.STRING(FIELD_LENGTHS.ERP_REFERENCE))
  declare erpReference: string | null;

  @Column(DataType.DATE(3))
  declare erpSyncedAt: Date | null;

  @Column(DataType.STRING(FIELD_LENGTHS.CUSTOMER_NAME))
  declare customerName: string | null;

  @Column(DataType.STRING(FIELD_LENGTHS.REGISTRATION_NUMBER))
  declare customerCompanyNumber: string | null;

  @Column(DataType.STRING(FIELD_LENGTHS.REGISTRATION_NUMBER))
  declare customerAssociationNumber: string | null;

  @Column(DataType.STRING(FIELD_LENGTHS.STREET_ADDRESS))
  declare customerAddress: string | null;

  @Column(DataType.STRING(FIELD_LENGTHS.CITY_NAME))
  declare customerCity: string | null;

  @Column(DataType.STRING(FIELD_LENGTHS.PHONE))
  declare customerPhone: string | null;

  @Column(DataType.STRING(FIELD_LENGTHS.EMAIL))
  declare customerEmail: string | null;

  @Column(DataType.SMALLINT)
  declare customerFloor: number | null;

  @Column(DataType.STRING(FIELD_LENGTHS.APARTMENT))
  declare customerApartment: string | null;

  @Column(DataType.STRING(FIELD_LENGTHS.BUILDING_UNIT))
  declare customerUnit: string | null;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @DeletedAt
  declare deletedAt: Date | null;

  @BelongsTo(() => ProjectType)
  declare projectType?: ProjectType;

  @BelongsTo(() => ProjectStage)
  declare stage?: ProjectStage;

  @BelongsTo(() => User, 'createdById')
  declare createdBy?: User;

  @HasMany(() => ProjectMember)
  declare members?: ProjectMember[];
}
