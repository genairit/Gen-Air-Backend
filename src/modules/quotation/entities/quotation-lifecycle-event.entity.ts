import {
  Table,
  Model,
  Column,
  DataType,
  PrimaryKey,
} from 'sequelize-typescript';

import type { TQuotationStatus } from '../constants/quotation.constant';
import type { IQuotationLifecycleRecord } from '../interfaces/quotation-lifecycle.interface';
import type { QuotationLifecycleActionType } from '../constants/quotation-lifecycle.constant';

@Table({ tableName: 'quotation_lifecycle_events', timestamps: false })
export class QuotationLifecycleEvent
  extends Model<IQuotationLifecycleRecord>
  implements IQuotationLifecycleRecord
{
  @PrimaryKey
  @Column({ type: DataType.UUID, allowNull: false })
  declare id: string;
  @Column({ type: DataType.UUID, allowNull: false })
  declare quotationId: string;
  @Column({ type: DataType.TEXT, allowNull: false })
  declare action: QuotationLifecycleActionType;
  @Column({ type: DataType.TEXT, allowNull: false })
  declare fromStatus: TQuotationStatus;
  @Column({ type: DataType.TEXT, allowNull: false })
  declare toStatus: TQuotationStatus;
  @Column({ type: DataType.UUID, allowNull: false })
  declare actorId: string;
  @Column({ type: DataType.TEXT, allowNull: false })
  declare actorName: string;
  @Column({ type: DataType.DATE, allowNull: false })
  declare occurredAt: string;
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare quotationVersion: number;
  @Column({ type: DataType.TEXT, allowNull: true })
  declare reason: string | null;
  @Column({ type: DataType.JSONB, allowNull: false })
  declare evidence: IQuotationLifecycleRecord['evidence'];
}
