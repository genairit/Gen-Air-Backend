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

import type { MaterialBasisType } from '../constants/material.constant';

@Table({ tableName: 'catalogue_item_materials' })
export class CatalogueItemMaterial extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;
  @Column({ type: DataType.UUID, allowNull: false })
  declare catalogueItemId: string;
  @Column({ type: DataType.UUID, allowNull: false })
  declare materialId: string;
  @Column({ type: DataType.DECIMAL(14, 4), allowNull: true })
  declare quantityPerItem: string | null;
  @Column({ type: DataType.STRING(24), allowNull: false })
  declare basis: MaterialBasisType;
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare displayOrder: number;
  @Column({ type: DataType.STRING(1000), allowNull: false })
  declare notes: string;
  @CreatedAt
  declare createdAt: Date;
  @UpdatedAt
  declare updatedAt: Date;
}
