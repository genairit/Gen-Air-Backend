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

@Table({ tableName: 'project_supplier_agreements' })
export class ProjectSupplierAgreement extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;
  @Column({ type: DataType.UUID, allowNull: false })
  declare projectId: string;
  @Column({ type: DataType.STRING(200), allowNull: false })
  declare boqSourceKey: string;
  @Column({ type: DataType.UUID, allowNull: false })
  declare materialId: string;
  @Column({ type: DataType.STRING(12), allowNull: false })
  declare materialUnit: string;
  @Column({ type: DataType.UUID, allowNull: false })
  declare supplierId: string;
  @Column({ type: DataType.DECIMAL(16, 4), allowNull: false })
  declare unitPrice: string;
  @Column({ type: DataType.STRING(3), allowNull: false })
  declare currencyCode: string;
  @Column({ type: DataType.DECIMAL(16, 8), allowNull: true })
  declare agreedQuantity: string | null;
  @Column({ type: DataType.DATEONLY, allowNull: true })
  declare effectiveFrom: string | null;
  @Column({ type: DataType.DATEONLY, allowNull: true })
  declare effectiveThrough: string | null;
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  declare active: boolean;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 1 })
  declare version: number;
  @Column({ type: DataType.STRING(1000), allowNull: false, defaultValue: '' })
  declare notes: string;
  @Column({ type: DataType.UUID, allowNull: false })
  declare createdById: string;
  @Column({ type: DataType.UUID, allowNull: false })
  declare updatedById: string;
  @CreatedAt
  declare createdAt: Date;
  @UpdatedAt
  declare updatedAt: Date;
}
