import {
  Model,
  Table,
  Column,
  Default,
  DataType,
  PrimaryKey,
} from 'sequelize-typescript';

@Table({ tableName: 'project_boq_revisions', timestamps: false })
export class ProjectBoqRevision extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;
  @Column({ type: DataType.UUID, allowNull: false })
  declare boqId: string;
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare revision: number;
  @Column({ type: DataType.UUID, allowNull: true })
  declare sourceQuotationId: string | null;
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare sourceQuotationVersion: number | null;
  @Column({ type: DataType.JSONB, allowNull: false })
  declare lines: object[];
  @Column({ type: DataType.UUID, allowNull: false })
  declare createdById: string;
  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  declare createdAt: Date;
}
