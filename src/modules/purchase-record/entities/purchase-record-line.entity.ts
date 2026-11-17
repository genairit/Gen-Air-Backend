import {
  Model,
  Table,
  Column,
  Default,
  DataType,
  CreatedAt,
  PrimaryKey,
} from 'sequelize-typescript';

@Table({ tableName: 'purchase_record_lines', updatedAt: false })
export class PurchaseRecordLine extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;
  @Column({ type: DataType.UUID, allowNull: false })
  declare recordId: string;
  @Column({ type: DataType.UUID, allowNull: false })
  declare boqLineId: string;
  @Column({ type: DataType.STRING(200), allowNull: false })
  declare boqSourceKey: string;
  @Column({ type: DataType.UUID, allowNull: false })
  declare materialId: string;
  @Column({ type: DataType.STRING(200), allowNull: false })
  declare materialName: string;
  @Column({ type: DataType.STRING(12), allowNull: false })
  declare materialUnit: string;
  @Column({ type: DataType.DECIMAL(16, 8), allowNull: false })
  declare quantity: string;
  @Column({ type: DataType.DECIMAL(16, 4), allowNull: true })
  declare unitCost: string | null;
  @Column({ type: DataType.STRING(3), allowNull: false, defaultValue: 'ILS' })
  declare currencyCode: string;
  @Column({ type: DataType.UUID, allowNull: true })
  declare supplierAgreementId: string | null;
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare supplierAgreementVersion: number | null;
  @CreatedAt
  declare createdAt: Date;
}
