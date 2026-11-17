import {
  Model,
  Table,
  Column,
  Default,
  DataType,
  CreatedAt,
  PrimaryKey,
} from 'sequelize-typescript';

@Table({ tableName: 'project_supplier_agreement_revisions', updatedAt: false })
export class ProjectSupplierAgreementRevision extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;
  @Column({ type: DataType.UUID, allowNull: false })
  declare agreementId: string;
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare version: number;
  @Column({ type: DataType.JSONB, allowNull: false })
  declare snapshot: object;
  @Column({ type: DataType.UUID, allowNull: false })
  declare actorId: string;
  @CreatedAt
  declare createdAt: Date;
}
