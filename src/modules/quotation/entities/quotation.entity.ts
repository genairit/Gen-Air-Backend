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

import type { IQuotation } from '../interfaces/quotation.interface';
import type { TQuotationStatus } from '../constants/quotation.constant';
import type { PaymentTermsType } from '@Constants/payment-terms.constant';
import type { IPaymentStage } from '../interfaces/quotation-document.interface';
import type { IQuotationRule } from '@Modules/quotation-rule/interfaces/quotation-rule.interface';

@Table({ tableName: 'quotations', paranoid: true })
export class Quotation
  extends Model<
    IQuotation,
    Omit<IQuotation, 'createdAt' | 'updatedAt' | 'deletedAt'>
  >
  implements IQuotation
{
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;
  @Column({ type: DataType.STRING(40), allowNull: false })
  declare number: string;
  @Column({ type: DataType.UUID, allowNull: false })
  declare customerId: string;
  @Column({ type: DataType.UUID, allowNull: true })
  declare projectId: string | null;
  @Column({ type: DataType.STRING(20), allowNull: false })
  declare status: TQuotationStatus;
  @Column({ type: DataType.DATEONLY, allowNull: false })
  declare date: string;
  @Column({ type: DataType.STRING(100), allowNull: false })
  declare brand: string;
  @Column({ type: DataType.STRING(40), allowNull: true })
  declare paymentTerms: PaymentTermsType | null;
  @Column({ type: DataType.STRING(1000), allowNull: false })
  declare paymentTermsNote: string;
  @Column({ type: DataType.JSONB, allowNull: false })
  declare paymentSchedule: IPaymentStage[];
  @Column({ type: DataType.DECIMAL(7, 4), allowNull: false })
  declare discountPercent: string;
  @Column({ type: DataType.DECIMAL(16, 2), allowNull: true })
  declare targetPretaxAmount: string | null;
  @Column({ type: DataType.DECIMAL(7, 4), allowNull: false })
  declare vatRate: string;
  @Column({ type: DataType.STRING(5000), allowNull: false })
  declare internalNotes: string;
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare version: number;
  @Column({ type: DataType.JSONB, allowNull: false })
  declare acknowledgedWarnings: string[];
  @Column({ type: DataType.UUID, allowNull: false })
  declare createdById: string;
  @Column({ type: DataType.UUID, allowNull: false })
  declare updatedById: string;
  @Column({ type: DataType.UUID, allowNull: true })
  declare approvedById: string | null;
  @Column({ type: DataType.DATE, allowNull: true })
  declare approvedAt: Date | null;
  @Column({ type: DataType.JSONB, allowNull: false })
  declare ruleConfiguration: IQuotationRule[];
  @Column({ type: DataType.STRING(64), allowNull: false })
  declare ruleConfigFingerprint: string;
  @Column(DataType.VIRTUAL)
  declare customerName: string;
  @Column(DataType.VIRTUAL)
  declare projectName: string | null;

  @CreatedAt
  declare createdAt: Date;
  @UpdatedAt
  declare updatedAt: Date;
  @DeletedAt
  declare deletedAt: Date | null;
}
