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

import type {
  MaterialUnitType,
  MaterialStatusType,
} from '../constants/material.constant';

@Table({ tableName: 'materials' })
export class Material extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;
  @Column({ type: DataType.STRING(100), allowNull: false })
  declare code: string;
  @Column({ type: DataType.STRING(200), allowNull: false })
  declare name: string;
  @Column({ type: DataType.STRING(100), allowNull: false })
  declare category: string;
  @Column({ type: DataType.STRING(300), allowNull: true })
  declare specification: string | null;
  @Column({ type: DataType.STRING(12), allowNull: false })
  declare unit: MaterialUnitType;
  @Column({ type: DataType.STRING(20), allowNull: false })
  declare status: MaterialStatusType;
  @Column({ type: DataType.STRING(1000), allowNull: false })
  declare notes: string;
  @CreatedAt
  declare createdAt: Date;
  @UpdatedAt
  declare updatedAt: Date;
}
