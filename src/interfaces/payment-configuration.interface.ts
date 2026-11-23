import type { PaymentTermsType } from '@Constants/payment-terms.constant';

export interface IPaymentStage {
  text: string;
  percent: string;
}

export interface IPaymentConfiguration {
  paymentSchedule: IPaymentStage[];
  paymentTerms: PaymentTermsType | null;
}

export interface IPaymentConfigurationIssues {
  terms: string[];
  schedule: string[];
}
