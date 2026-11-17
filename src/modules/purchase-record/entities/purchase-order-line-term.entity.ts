import {
  Model,
  Table,
  Column,
  DataType,
  CreatedAt,
  PrimaryKey,
} from 'sequelize-typescript';

@Table({ tableName: 'purchase_order_line_terms', updatedAt: false })
export class PurchaseOrderLineTerm extends Model {
  @PrimaryKey
  @Column(DataType.UUID)
  declare recordLineId: string;
  @Column({ type: DataType.UUID, allowNull: false })
  declare supplierAgreementId: string;
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare supplierAgreementVersion: number;
  @Column({ type: DataType.DECIMAL(16, 4), allowNull: false })
  declare unitCost: string;
  @Column({ type: DataType.STRING(3), allowNull: false })
  declare currencyCode: string;
  @Column({ type: DataType.UUID, allowNull: false })
  declare actorId: string;
  @CreatedAt
  declare createdAt: Date;
}
