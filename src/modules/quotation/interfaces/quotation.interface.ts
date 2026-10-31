import type { IPaymentStage } from './quotation-document.interface';
import type { TQuotationStatus } from '../constants/quotation.constant';
import type { PaymentTermsType } from '@Constants/payment-terms.constant';
import type { IQuotationRule } from '@Modules/quotation-rule/interfaces/quotation-rule.interface';

export interface IQuotation {
  id: string;
  date: string;
  brand: string;
  number: string;
  vatRate: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  customerId: string;
  createdById: string;
  updatedById: string;
  internalNotes: string;
  deletedAt: Date | null;
  discountPercent: string;
  approvedAt: Date | null;
  projectId: string | null;
  status: TQuotationStatus;
  paymentTermsNote: string;
  approvedById: string | null;
  ruleConfigFingerprint: string;
  acknowledgedWarnings: string[];
  paymentSchedule: IPaymentStage[];
  targetPretaxAmount: string | null;
  ruleConfiguration: IQuotationRule[];
  paymentTerms: PaymentTermsType | null;
}
