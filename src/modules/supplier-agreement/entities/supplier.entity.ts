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

@Table({ tableName: 'suppliers' })
export class Supplier extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;
  @Column({ type: DataType.STRING(120), allowNull: false })
  declare name: string;
  @Column({ type: DataType.STRING(120), allowNull: true })
  declare contactName: string | null;
  @Column({ type: DataType.STRING(32), allowNull: true })
  declare phone: string | null;
  @Column({ type: DataType.STRING(254), allowNull: true })
  declare email: string | null;
  @Column({ type: DataType.STRING(1000), allowNull: false, defaultValue: '' })
  declare notes: string;
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  declare active: boolean;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 1 })
  declare version: number;
  @Column({ type: DataType.UUID, allowNull: false })
  declare createdById: string;
  @Column({ type: DataType.UUID, allowNull: false })
  declare updatedById: string;
  @CreatedAt
  declare createdAt: Date;
  @UpdatedAt
  declare updatedAt: Date;
}
