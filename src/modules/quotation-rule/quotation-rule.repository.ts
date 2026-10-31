import { Transaction } from 'sequelize';
import { Injectable } from '@nestjs/common';
import { QuotationRule } from './entities/quotation-rule.entity';

@Injectable()
export class QuotationRuleRepository {
  list(transaction?: Transaction): Promise<QuotationRule[]> {
    return QuotationRule.findAll({
      order: [['key', 'ASC']],
      transaction,
      lock: transaction?.LOCK.SHARE,
    });
  }
}
