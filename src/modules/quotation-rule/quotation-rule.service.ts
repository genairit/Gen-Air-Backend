import { Transaction } from 'sequelize';
import { Injectable } from '@nestjs/common';
import { QuotationRuleRepository } from './quotation-rule.repository';
import { validateRuleConfiguration } from './utilities/quotation-rule.utility';
import type { IQuotationRuleConfiguration } from './interfaces/quotation-rule-configuration.interface';

@Injectable()
export class QuotationRuleService {
  constructor(private readonly repository: QuotationRuleRepository) {}
  async configuration(
    transaction?: Transaction,
  ): Promise<IQuotationRuleConfiguration> {
    const rules = await this.repository.list(transaction);
    return validateRuleConfiguration(
      rules.map((rule) => ({
        key: rule.key,
        enabled: rule.enabled,
        version: rule.version,
        parameters: rule.parameters,
      })),
    );
  }
}
