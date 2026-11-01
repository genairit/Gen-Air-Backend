import type { IQuotationRule } from './quotation-rule.interface';

export interface IQuotationRuleConfiguration {
  fingerprint: string;
  rules: IQuotationRule[];
}
