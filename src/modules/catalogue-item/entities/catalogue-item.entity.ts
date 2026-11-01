import {
  Table,
  Model,
  Column,
  Default,
  DataType,
  CreatedAt,
  UpdatedAt,
  DeletedAt,
  PrimaryKey,
} from 'sequelize-typescript';

import type { ICatalogueItem } from '../interfaces/catalogue-item.interface';

@Table({ tableName: 'catalogue_items', paranoid: true })
export class CatalogueItem
  extends Model<
    ICatalogueItem,
    Omit<ICatalogueItem, 'createdAt' | 'updatedAt' | 'deletedAt'>
  >
  implements ICatalogueItem
{
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;
  @Column({ type: DataType.STRING(200), allowNull: false })
  declare sku: string;
  @Column({ type: DataType.STRING(1000), allowNull: false })
  declare description: string;
  @Column({ type: DataType.STRING(40), allowNull: false })
  declare unit: string;
  @Column({ type: DataType.DECIMAL(16, 4), allowNull: false })
  declare price: string;
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare capacityBtu: number | null;
  @Column({ type: DataType.STRING(100), allowNull: false })
  declare brand: string;
  @Column({ type: DataType.STRING(10), allowNull: true })
  declare systemType: string | null;
  @Column({ type: DataType.STRING(30), allowNull: false })
  declare equipmentRole: string;
  @Column({ type: DataType.JSONB, allowNull: false })
  declare equipmentTypes: string[];
  @Column({ type: DataType.STRING(20), allowNull: false })
  declare status: string;
  @Column({ type: DataType.STRING(20), allowNull: false })
  declare preference: string;
  @Column({ type: DataType.BOOLEAN, allowNull: false })
  declare includesRemote: boolean;
  @Column({ type: DataType.BOOLEAN, allowNull: false })
  declare includesThermostat: boolean;
  @CreatedAt
  declare createdAt: Date;
  @UpdatedAt
  declare updatedAt: Date;
  @DeletedAt
  declare deletedAt: Date | null;
}
