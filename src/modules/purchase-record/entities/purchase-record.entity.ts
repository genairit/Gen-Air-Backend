import {
  Model,
  Table,
  Column,
  Default,
  DataType,
  CreatedAt,
  UpdatedAt,
  PrimaryKey,
} from 'sequelize-typescript';

@Table({ tableName: 'purchase_records' })
export class PurchaseRecord extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;
  @Column({ type: DataType.UUID, allowNull: false })
  declare projectId: string;
  @Column({ type: DataType.STRING(20), allowNull: false })
  declare status: string;
  @Column({ type: DataType.STRING(120), allowNull: true })
  declare supplierName: string | null;
  @Column({ type: DataType.DATEONLY, allowNull: true })
  declare orderDate: string | null;
  @Column({ type: DataType.STRING(200), allowNull: true })
  declare onBehalfOf: string | null;
  @Column({ type: DataType.STRING(1000), allowNull: true })
  declare exceptionReason: string | null;
  @Column({ type: DataType.STRING(1000), allowNull: false, defaultValue: '' })
  declare notes: string;
  @Column({ type: DataType.TEXT, allowNull: false, defaultValue: '' })
  declare materialSearch: string;
  @Column({ type: DataType.UUID, allowNull: false })
  declare createdById: string;
  @Column({ type: DataType.UUID, allowNull: false })
  declare updatedById: string;
  @Column({ type: DataType.UUID, allowNull: false })
  declare idempotencyKey: string;
  @Column({ type: DataType.STRING(64), allowNull: false })
  declare payloadHash: string;
  @CreatedAt
  declare createdAt: Date;
  @UpdatedAt
  declare updatedAt: Date;
}
