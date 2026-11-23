import {
  Table,
  Model,
  Column,
  DataType,
  CreatedAt,
  PrimaryKey,
} from 'sequelize-typescript';

import type { IQuotationCloneCommand } from '../interfaces/quotation-clone-command.interface';

@Table({
  tableName: 'quotation_clone_commands',
  updatedAt: false,
  timestamps: true,
})
export class QuotationCloneCommand
  extends Model<IQuotationCloneCommand>
  implements IQuotationCloneCommand
{
  @PrimaryKey
  @Column({ type: DataType.UUID, allowNull: false })
  declare actorId: string;
  @PrimaryKey
  @Column({ type: DataType.UUID, allowNull: false })
  declare idempotencyKey: string;
  @Column({ type: DataType.STRING(64), allowNull: false })
  declare payloadHash: string;
  @Column({ type: DataType.UUID, allowNull: false })
  declare quotationId: string;
  @CreatedAt
  declare createdAt: Date;
}
