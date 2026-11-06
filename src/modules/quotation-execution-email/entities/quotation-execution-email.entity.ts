import {
  Table,
  Model,
  Column,
  Default,
  DataType,
  BelongsTo,
  CreatedAt,
  UpdatedAt,
  ForeignKey,
  PrimaryKey,
} from 'sequelize-typescript';

import {
  IQuotationExecutionEmail,
  TQuotationExecutionEmailCreation,
} from '../interfaces/quotation-execution-email.interface';

import { Task } from '@Modules/task/entities/task.entity';
import { User } from '@Modules/user/entities/user.entity';
import type { QuotationEmailStatusType } from '../constants/quotation-execution-email.constant';

@Table({
  tableName: 'quotation_execution_emails',
  indexes: [
    {
      name: 'uq_quotation_execution_emails_task',
      unique: true,
      fields: ['task_id'],
    },
  ],
})
export class QuotationExecutionEmail
  extends Model<IQuotationExecutionEmail, TQuotationExecutionEmailCreation>
  implements IQuotationExecutionEmail
{
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => Task)
  @Column({ allowNull: false, type: DataType.UUID })
  declare taskId: string;

  @Column({ allowNull: false, type: DataType.UUID })
  declare requestId: string;

  @ForeignKey(() => User)
  @Column({ allowNull: false, type: DataType.UUID })
  declare senderUserId: string;

  @Column({ allowNull: false, type: DataType.UUID })
  declare architectContactId: string;

  @Column({ allowNull: false, type: DataType.STRING(128) })
  declare planFileId: string;

  @Column({ allowNull: false, type: DataType.STRING(128) })
  declare zipFileId: string;

  @Column({ allowNull: false, type: DataType.STRING(80) })
  declare planVersion: string;

  @Column({ allowNull: false, type: DataType.ARRAY(DataType.UUID) })
  declare recipientContactIds: string[];

  @Column({ allowNull: false, type: DataType.ARRAY(DataType.TEXT) })
  declare recipientEmails: string[];

  @Column({ allowNull: false, type: DataType.TEXT })
  declare subject: string;

  @Column({ allowNull: false, type: DataType.TEXT })
  declare body: string;

  @Column({ allowNull: false, type: DataType.STRING(20) })
  declare status: QuotationEmailStatusType;

  @Column(DataType.STRING(255))
  declare providerMessageId: string | null;

  @Column(DataType.STRING(100))
  declare errorCode: string | null;

  @CreatedAt declare createdAt: Date;
  @UpdatedAt declare updatedAt: Date;
  @BelongsTo(() => Task) declare task?: Task;
  @BelongsTo(() => User, 'senderUserId') declare sender?: User;
}
