import {
  Model,
  Table,
  Column,
  Default,
  DataType,
  CreatedAt,
  PrimaryKey,
} from 'sequelize-typescript';

@Table({ tableName: 'purchase_record_corrections', updatedAt: false })
export class PurchaseRecordCorrection extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;
  @Column({ type: DataType.UUID, allowNull: false })
  declare recordLineId: string;
  @Column({ type: DataType.UUID, allowNull: false })
  declare idempotencyKey: string;
  @Column({ type: DataType.DECIMAL(16, 8), allowNull: false })
  declare quantity: string;
  @Column({ type: DataType.UUID, allowNull: false })
  declare actorId: string;
  @Column({ type: DataType.STRING(1000), allowNull: false })
  declare reason: string;
  @CreatedAt
  declare createdAt: Date;
}
