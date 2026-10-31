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
  ICustomer,
  TCustomerCreationAttributes,
} from '../interfaces/customer.interface';

import {
  PRIORITY_SYNC_STATUSES,
  type PrioritySyncStatusType,
  PRIORITY_SYNC_STATUS_VALUES,
} from '../constants/priority-sync-status.constant';

import {
  type ProjectDetailFieldSetType,
  PROJECT_DETAIL_FIELD_SET_VALUES,
} from '@Constants/project-detail-field-set.constant';

import { User } from '@Modules/user/entities/user.entity';
import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import type { PaymentTermsType } from '@Constants/payment-terms.constant';
import { CustomerContact } from '@Modules/customer-contact/entities/customer-contact.entity';

@Table({
  tableName: 'customers',
  paranoid: true,
  indexes: [
    {
      unique: true,
      fields: ['tax_id'],
      where: { deleted_at: null },
      name: 'uq_customers_tax_id',
    },
    {
      fields: ['name'],
      where: { deleted_at: null },
      name: 'idx_customers_name',
    },
    {
      fields: ['priority_sync_status'],
      where: { deleted_at: null },
      name: 'idx_customers_priority_sync_status',
    },
  ],
})
export class Customer
  extends Model<ICustomer, TCustomerCreationAttributes>
  implements ICustomer
{
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({
    allowNull: false,
    type: DataType.ENUM(...PROJECT_DETAIL_FIELD_SET_VALUES),
  })
  declare customerType: ProjectDetailFieldSetType;

  @Column({
    allowNull: false,
    type: DataType.STRING(FIELD_LENGTHS.CUSTOMER_NAME),
  })
  declare name: string;

  @Column({
    allowNull: false,
    type: DataType.STRING(FIELD_LENGTHS.REGISTRATION_NUMBER),
  })
  declare taxId: string;

  @Column({
    allowNull: false,
    type: DataType.STRING(FIELD_LENGTHS.STREET_ADDRESS),
  })
  declare address: string;

  @Column({
    allowNull: false,
    type: DataType.STRING(FIELD_LENGTHS.CONTACT_NAME),
  })
  declare contactName: string;

  @Column({ allowNull: false, type: DataType.STRING(FIELD_LENGTHS.PHONE) })
  declare phone: string;

  @Column({ allowNull: false, type: DataType.CITEXT })
  declare email: string;

  @Column(DataType.STRING(FIELD_LENGTHS.PRIORITY_ID))
  declare priorityId: string | null;

  @Default(PRIORITY_SYNC_STATUSES.PENDING)
  @Column({
    allowNull: false,
    type: DataType.ENUM(...PRIORITY_SYNC_STATUS_VALUES),
  })
  declare prioritySyncStatus: PrioritySyncStatusType;

  @Column(DataType.DATE(3))
  declare prioritySyncedAt: Date | null;

  @Default(0)
  @Column({ allowNull: false, type: DataType.INTEGER })
  declare prioritySyncAttempts: number;

  @Column(DataType.STRING(FIELD_LENGTHS.PRIORITY_SYNC_ERROR))
  declare prioritySyncError: string | null;

  @ForeignKey(() => User)
  @Column({ allowNull: false, type: DataType.UUID })
  declare createdById: string;

  @Column({ type: DataType.STRING(40), allowNull: true })
  declare paymentTerms: PaymentTermsType | null;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @DeletedAt
  declare deletedAt: Date | null;

  @HasMany(() => CustomerContact, 'customerId')
  declare contacts?: CustomerContact[];

  @BelongsTo(() => User, 'createdById')
  declare createdBy?: User;
}
