import {
  Table,
  Model,
  Column,
  DataType,
  CreatedAt,
  UpdatedAt,
  ForeignKey,
  PrimaryKey,
} from 'sequelize-typescript';

import { Project } from '@Modules/project/entities/project.entity';
import { Quotation } from '@Modules/quotation/entities/quotation.entity';
import type { IQuotationProject } from '../interfaces/quotation-project.interface';

@Table({
  tableName: 'quotation_projects',
  indexes: [
    { name: 'idx_quotation_projects_project_id', fields: ['project_id'] },
    {
      unique: true,
      fields: ['quotation_id'],
      where: { is_primary: true },
      name: 'uq_quotation_projects_primary',
    },
  ],
})
export class QuotationProject
  extends Model<
    IQuotationProject,
    Omit<IQuotationProject, 'createdAt' | 'updatedAt'>
  >
  implements IQuotationProject
{
  @PrimaryKey
  @ForeignKey(() => Quotation)
  @Column({ type: DataType.UUID, allowNull: false })
  declare quotationId: string;
  @PrimaryKey
  @ForeignKey(() => Project)
  @Column({ type: DataType.UUID, allowNull: false })
  declare projectId: string;
  @Column({ type: DataType.BOOLEAN, allowNull: false })
  declare isPrimary: boolean;
  @CreatedAt
  declare createdAt: Date;
  @UpdatedAt
  declare updatedAt: Date;
}
