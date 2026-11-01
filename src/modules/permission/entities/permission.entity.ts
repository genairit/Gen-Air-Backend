import {
  Table,
  Model,
  Column,
  DataType,
  PrimaryKey,
} from 'sequelize-typescript';

import { IPermission } from '../interfaces/permission.interface';

@Table({ tableName: 'permissions', timestamps: false })
export class Permission extends Model<IPermission> implements IPermission {
  @PrimaryKey
  @Column(DataType.TEXT)
  declare key: string;

  @Column({ allowNull: false, type: DataType.TEXT })
  declare feature: string;

  @Column({ allowNull: false, type: DataType.TEXT })
  declare action: string;
}
