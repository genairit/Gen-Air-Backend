import {
  Model,
  Table,
  Column,
  Default,
  DataType,
  CreatedAt,
  PrimaryKey,
} from 'sequelize-typescript';

@Table({ tableName: 'purchase_record_events', updatedAt: false })
export class PurchaseRecordEvent extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;
  @Column({ type: DataType.UUID, allowNull: false })
  declare recordId: string;
  @Column({ type: DataType.UUID, allowNull: false })
  declare idempotencyKey: string;
  @Column({ type: DataType.STRING(64), allowNull: false })
  declare payloadHash: string;
  @Column({ type: DataType.UUID, allowNull: false })
  declare actorId: string;
  @Column({ type: DataType.STRING(20), allowNull: false })
  declare action: string;
  @Column({ type: DataType.STRING(20), allowNull: true })
  declare previousStatus: string | null;
  @Column({ type: DataType.STRING(20), allowNull: false })
  declare nextStatus: string;
  @Column({ type: DataType.STRING(1000), allowNull: false, defaultValue: '' })
  declare reason: string;
  @CreatedAt
  declare createdAt: Date;
}
