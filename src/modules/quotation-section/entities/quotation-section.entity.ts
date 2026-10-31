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

import type { IQuotationSection } from '../interfaces/quotation-section.interface';
import type { TSystemType } from '@Modules/quotation/constants/quotation.constant';

@Table({ tableName: 'quotation_sections', paranoid: true })
export class QuotationSection
  extends Model<
    IQuotationSection,
    Omit<IQuotationSection, 'createdAt' | 'updatedAt' | 'deletedAt'>
  >
  implements IQuotationSection
{
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;
  @Column({ type: DataType.UUID, allowNull: false })
  declare quotationId: string;
  @Column({ type: DataType.STRING(200), allowNull: false })
  declare title: string;
  @Column({ type: DataType.STRING(10), allowNull: false })
  declare systemType: TSystemType;
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare displayOrder: number;
  @CreatedAt
  declare createdAt: Date;
  @UpdatedAt
  declare updatedAt: Date;
  @DeletedAt
  declare deletedAt: Date | null;
}
