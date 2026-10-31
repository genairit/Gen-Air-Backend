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

import type { IQuotationItem } from '../interfaces/quotation-item.interface';

@Table({ tableName: 'quotation_items', paranoid: true })
export class QuotationItem
  extends Model<
    IQuotationItem,
    Omit<IQuotationItem, 'createdAt' | 'updatedAt' | 'deletedAt'>
  >
  implements IQuotationItem
{
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;
  @Column({ type: DataType.UUID, allowNull: false })
  declare sectionId: string;
  @Column({ type: DataType.UUID, allowNull: false })
  declare catalogueItemId: string;
  @Column({ type: DataType.UUID, allowNull: true })
  declare parentItemId: string | null;
  @Column({ type: DataType.STRING(200), allowNull: false })
  declare sku: string;
  @Column({ type: DataType.STRING(1000), allowNull: false })
  declare description: string;
  @Column({ type: DataType.STRING(40), allowNull: false })
  declare unit: string;
  @Column({ type: DataType.DECIMAL(16, 4), allowNull: false })
  declare quotedPrice: string;
  @Column({ type: DataType.DECIMAL(12, 4), allowNull: false })
  declare quantity: string;
  @Column({ type: DataType.STRING(30), allowNull: false })
  declare equipmentRole: string;
  @Column({ type: DataType.STRING(100), allowNull: true })
  declare equipmentType: string | null;
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare capacityBtu: number | null;
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare requestedCapacityBtu: number | null;
  @Column({ type: DataType.STRING(200), allowNull: false })
  declare location: string;
  @Column({ type: DataType.STRING(1), allowNull: true })
  declare circuit: string | null;
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare displayOrder: number;
  @Column({ type: DataType.BOOLEAN, allowNull: false })
  declare includesRemote: boolean;
  @Column({ type: DataType.BOOLEAN, allowNull: false })
  declare includesThermostat: boolean;
  @Column({ type: DataType.STRING(20), allowNull: false })
  declare cataloguePreference: string;
  @Column({ type: DataType.STRING(20), allowNull: true })
  declare controlKind: string | null;
  @Column({ type: DataType.STRING(20), allowNull: false })
  declare catalogueStatus: string;
  @CreatedAt
  declare createdAt: Date;
  @UpdatedAt
  declare updatedAt: Date;
  @DeletedAt
  declare deletedAt: Date | null;
}
