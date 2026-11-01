import type { TQuotationRuleKey } from '../constants/quotation-rule.constant';

export interface IQuotationRule {
  version: number;
  enabled: boolean;
  key: TQuotationRuleKey;
  parameters: {
    [parameter: string]: number;
  };
}
