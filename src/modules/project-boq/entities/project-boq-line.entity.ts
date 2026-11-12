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

@Table({ tableName: 'project_boq_lines' })
export class ProjectBoqLine extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;
  @Column({ type: DataType.UUID, allowNull: false })
  declare boqId: string;
  @Column({ type: DataType.UUID, allowNull: false })
  declare materialId: string;
  @Column({ type: DataType.STRING(200), allowNull: false })
  declare sourceKey: string;
  @Column({ type: DataType.STRING(200), allowNull: false })
  declare systemTitle: string;
  @Column({ type: DataType.STRING(300), allowNull: false })
  declare componentTitle: string;
  @Column({ type: DataType.STRING(100), allowNull: false })
  declare materialCode: string;
  @Column({ type: DataType.STRING(200), allowNull: false })
  declare materialName: string;
  @Column({ type: DataType.STRING(100), allowNull: false })
  declare materialCategory: string;
  @Column({ type: DataType.STRING(300), allowNull: true })
  declare materialSpecification: string | null;
  @Column({ type: DataType.STRING(12), allowNull: false })
  declare materialUnit: string;
  @Column({ type: DataType.STRING(24), allowNull: false })
  declare sourceBasis: string;
  @Column({ type: DataType.DECIMAL(16, 8), allowNull: true })
  declare proposedQuantity: string | null;
  @Column({ type: DataType.DECIMAL(16, 8), allowNull: true })
  declare requiredQuantity: string | null;
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare quantityOverridden: boolean;
  @Column({ type: DataType.DECIMAL(16, 4), allowNull: true })
  declare estimatedUnitCost: string | null;
  @Column({ type: DataType.STRING(20), allowNull: false })
  declare reviewState: string;
  @Column({ type: DataType.STRING(1000), allowNull: false })
  declare notes: string;
  @Column({ type: DataType.JSONB, allowNull: false })
  declare sourceSnapshot: object;
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare displayOrder: number;
  @CreatedAt
  declare createdAt: Date;
  @UpdatedAt
  declare updatedAt: Date;
}
