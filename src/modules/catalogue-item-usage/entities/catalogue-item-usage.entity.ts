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

import type { ICatalogueItemUsage } from '../interfaces/catalogue-item-usage.interface';

@Table({ tableName: 'catalogue_item_usage', paranoid: true })
export class CatalogueItemUsage
  extends Model<
    ICatalogueItemUsage,
    Omit<ICatalogueItemUsage, 'createdAt' | 'updatedAt' | 'deletedAt'>
  >
  implements ICatalogueItemUsage
{
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;
  @Column({ type: DataType.UUID, allowNull: false })
  declare userId: string;
  @Column({ type: DataType.UUID, allowNull: false })
  declare catalogueItemId: string;
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare selectionCount: number;
  @Column({ type: DataType.DATE, allowNull: false })
  declare lastSelectedAt: Date;
  @CreatedAt
  declare createdAt: Date;
  @UpdatedAt
  declare updatedAt: Date;
  @DeletedAt
  declare deletedAt: Date | null;
}
