import {
  TQuotationExecutionEmailUpdate,
  TQuotationExecutionEmailCreation,
} from './interfaces/quotation-execution-email.interface';

import { Transaction } from 'sequelize';
import { Injectable } from '@nestjs/common';
import { QuotationExecutionEmail } from './entities/quotation-execution-email.entity';

@Injectable()
export class QuotationExecutionEmailRepository {
  findByTaskId(
    taskId: string,
    transaction?: Transaction,
  ): Promise<QuotationExecutionEmail | null> {
    return QuotationExecutionEmail.findOne({ where: { taskId }, transaction });
  }

  create(
    values: TQuotationExecutionEmailCreation,
    transaction: Transaction,
  ): Promise<QuotationExecutionEmail> {
    return QuotationExecutionEmail.create(values, { transaction });
  }

  async update(
    taskId: string,
    values: TQuotationExecutionEmailUpdate,
    transaction?: Transaction,
  ): Promise<void> {
    await QuotationExecutionEmail.update(values, {
      where: { taskId },
      transaction,
    });
  }

  async updateIfRequest(
    taskId: string,
    requestId: string,
    values: TQuotationExecutionEmailUpdate,
    transaction?: Transaction,
  ): Promise<number> {
    const [updated] = await QuotationExecutionEmail.update(values, {
      where: { taskId, requestId },
      transaction,
    });
    return updated;
  }
}
