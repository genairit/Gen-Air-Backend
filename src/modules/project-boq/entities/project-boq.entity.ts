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

@Table({ tableName: 'project_boqs' })
export class ProjectBoq extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;
  @Column({ type: DataType.UUID, allowNull: false })
  declare projectId: string;
  @Column({ type: DataType.UUID, allowNull: true })
  declare sourceQuotationId: string | null;
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare sourceQuotationVersion: number | null;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare revision: number;
  @Column({ type: DataType.UUID, allowNull: false })
  declare createdById: string;
  @Column({ type: DataType.UUID, allowNull: false })
  declare updatedById: string;
  @CreatedAt
  declare createdAt: Date;
  @UpdatedAt
  declare updatedAt: Date;
}
