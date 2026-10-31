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

import {
  PaymentTermsType,
  PAYMENT_TERMS_VALUES,
} from '@Constants/payment-terms.constant';

import {
  ApartmentOwnershipType,
  APARTMENT_OWNERSHIP_VALUES,
} from '../constants/apartment-commercial.constant';

import { User } from '@Modules/user/entities/user.entity';
import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { Customer } from '@Modules/customer/entities/customer.entity';
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
    {
      fields: ['customer_id'],
      where: { deleted_at: null },
      name: 'idx_projects_customer_id',
    },
    {
      fields: ['parent_project_id'],
      where: { deleted_at: null },
      name: 'idx_projects_parent_project_id',
    },
  ],
})
export class Project
  extends Model<IProject, TProjectCreationAttributes>
  implements IProject
{
  @Column(DataType.ENUM(...APARTMENT_OWNERSHIP_VALUES))
  declare apartmentOwnership: ApartmentOwnershipType | null;

  @Column(DataType.DECIMAL)
  declare apartmentCredit: string | null;

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

  @Default(false)
  @Column({ allowNull: false, type: DataType.BOOLEAN })
  declare hasGeneralLightingCeilingLowering: boolean;

  @Column(DataType.DOUBLE)
  declare generalLightingCeilingLoweringHeight: number | null;

  @ForeignKey(() => ProjectType)
  @Column({ allowNull: false, type: DataType.UUID })
  declare projectTypeId: string;

  @ForeignKey(() => ProjectStage)
  @Column({ allowNull: false, type: DataType.UUID })
  declare stageId: string;

  @ForeignKey(() => User)
  @Column({ allowNull: false, type: DataType.UUID })
  declare createdById: string;

  @ForeignKey(() => Customer)
  @Column(DataType.UUID)
  declare customerId: string | null;

  @ForeignKey(() => Project)
  @Column(DataType.UUID)
  declare parentProjectId: string | null;

  @Default(false)
  @Column({ allowNull: false, type: DataType.BOOLEAN })
  declare hasOwnTeam: boolean;

  @Column(DataType.STRING(FIELD_LENGTHS.DRIVE_ID))
  declare driveFolderId: string | null;

  @Column(DataType.STRING(FIELD_LENGTHS.PRIORITY_ID))
  declare priorityId: string | null;

  @Column(DataType.DATE(3))
  declare prioritySyncedAt: Date | null;

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

  @Column(DataType.ENUM(...PAYMENT_TERMS_VALUES))
  declare paymentTerms: PaymentTermsType | null;

  @Column(DataType.STRING(FIELD_LENGTHS.PAYMENT_TERMS_NOTE))
  declare paymentTermsNote: string | null;

  @Column(DataType.STRING(FIELD_LENGTHS.FORMATTED_ADDRESS))
  declare address: string | null;

  @Column(DataType.TEXT)
  declare addressPlaceId: string | null;

  @Column(DataType.STRING(FIELD_LENGTHS.CITY_NAME))
  declare addressCity: string | null;

  @Column(DataType.STRING(FIELD_LENGTHS.CONTACT_NAME))
  declare contactName: string | null;

  @Column(DataType.STRING(FIELD_LENGTHS.PHONE))
  declare contactPhone: string | null;

  @Column(DataType.STRING(FIELD_LENGTHS.CONTACT_ROLE))
  declare contactRole: string | null;

  @Column(DataType.STRING(FIELD_LENGTHS.PROJECT_NOTES))
  declare notes: string | null;

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

  @BelongsTo(() => Customer)
  declare customer?: Customer;

  @BelongsTo(() => Project, 'parentProjectId')
  declare parentProject?: Project;

  @HasMany(() => ProjectMember)
  declare members?: ProjectMember[];
}
