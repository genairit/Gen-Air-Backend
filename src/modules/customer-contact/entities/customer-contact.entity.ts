import {
  Table,
  Model,
  Column,
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
  ICustomerContact,
  TCustomerContactCreation,
} from '../interfaces/customer-contact.interface';

import { col, fn } from 'sequelize';
import { User } from '@Modules/user/entities/user.entity';
import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { Customer } from '@Modules/customer/entities/customer.entity';

@Table({
  tableName: 'customer_contacts',
  paranoid: true,
  indexes: [
    { name: 'idx_customer_contacts_customer_id', fields: ['customer_id'] },
    { name: 'idx_customer_contacts_created_by_id', fields: ['created_by_id'] },
    {
      name: 'uq_customer_contacts_legacy_source',
      unique: true,
      fields: ['legacy_source_customer_id'],
    },
    {
      name: 'uq_customer_contacts_active_tuple',
      unique: true,
      fields: [
        'customer_id',
        'name',
        fn('coalesce', col('phone'), ''),
        fn('coalesce', col('email'), ''),
        fn('coalesce', col('role'), ''),
      ],
      where: { deleted_at: null },
    },
  ],
})
export class CustomerContact
  extends Model<ICustomerContact, TCustomerContactCreation>
  implements ICustomerContact
{
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => Customer)
  @Column({ allowNull: false, type: DataType.UUID })
  declare customerId: string;

  @Column({
    allowNull: false,
    type: DataType.STRING(FIELD_LENGTHS.CUSTOMER_NAME),
  })
  declare name: string;

  @Column(DataType.STRING(FIELD_LENGTHS.PHONE))
  declare phone: string | null;

  @Column(DataType.STRING(FIELD_LENGTHS.EMAIL))
  declare email: string | null;

  @Column(DataType.STRING(FIELD_LENGTHS.CONTACT_ROLE))
  declare role: string | null;

  @ForeignKey(() => User)
  @Column({ allowNull: false, type: DataType.UUID })
  declare createdById: string;

  @Column(DataType.UUID)
  declare legacySourceCustomerId: string | null;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @DeletedAt
  declare deletedAt: Date | null;

  @BelongsTo(() => Customer, 'customerId')
  declare customer?: Customer;
}
