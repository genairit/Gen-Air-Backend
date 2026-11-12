import {
  Model,
  Table,
  Column,
  Default,
  DataType,
  PrimaryKey,
} from 'sequelize-typescript';

@Table({ tableName: 'catalogue_item_material_revisions', timestamps: false })
export class CatalogueItemMaterialRevision extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;
  @Column({ type: DataType.UUID, allowNull: false })
  declare catalogueItemId: string;
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare revision: number;
  @Column({ type: DataType.JSONB, allowNull: false })
  declare lines: unknown[];
  @Column({ type: DataType.UUID, allowNull: true })
  declare createdById: string | null;
  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  declare createdAt: Date;
}
