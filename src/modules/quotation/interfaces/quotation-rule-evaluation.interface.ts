import type { IQuotationDocument } from './quotation-document.interface';
import type { IQuotationRuleConfiguration } from '@Modules/quotation-rule/interfaces/quotation-rule-configuration.interface';

export interface IQuotationWarningCandidate {
  text: string;
  context: string;
}
export interface IQuotationRuleContext {
  quotation: IQuotationDocument;
  configuration: IQuotationRuleConfiguration;
}
export interface IQuotationCircuit {
  name: string;
  indoor: string;
  outdoor: string;
}
