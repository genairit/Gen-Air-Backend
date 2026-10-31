import {
  Table,
  Model,
  Column,
  DataType,
  UpdatedAt,
  CreatedAt,
  PrimaryKey,
} from 'sequelize-typescript';

import type { IQuotationRule } from '../interfaces/quotation-rule.interface';
import type { TQuotationRuleKey } from '../constants/quotation-rule.constant';

@Table({ tableName: 'quotation_rules', timestamps: true })
export class QuotationRule
  extends Model<IQuotationRule>
  implements IQuotationRule
{
  @PrimaryKey
  @Column(DataType.STRING(60))
  declare key: TQuotationRuleKey;
  @Column({ type: DataType.BOOLEAN, allowNull: false })
  declare enabled: boolean;
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare version: number;
  @Column({ type: DataType.JSONB, allowNull: false })
  declare parameters: Record<string, number>;
  @CreatedAt
  declare createdAt: Date;
  @UpdatedAt
  declare updatedAt: Date;
}
