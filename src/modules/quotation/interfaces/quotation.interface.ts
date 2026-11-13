import type {
  TQuotationStatus,
  TQuotationRestorableStatus,
  TQuotationCancellationKind,
} from '../constants/quotation.constant';

import type { IPaymentStage } from './quotation-document.interface';
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
  brands: string[];
  customerId: string;
  issuerName: string;
  createdById: string;
  updatedById: string;
  internalNotes: string;
  deletedAt: Date | null;
  discountPercent: string;
  approvedAt: Date | null;
  status: TQuotationStatus;
  paymentTermsNote: string;
  salesAgentId: string | null;
  warningScopeVersion: number;
  approvedById: string | null;
  acknowledgedWarnings: string[];
  paymentSchedule: IPaymentStage[];
  targetPretaxAmount: string | null;
  ruleConfiguration: IQuotationRule[];
  paymentTerms: PaymentTermsType | null;
  cancellationHistory: IQuotationCancellation[];
  cancelledFromStatus: TQuotationRestorableStatus | null;
}

export interface IQuotationCancellation {
  reason: string;
  cancelledAt: string;
  cancelledById: string;
  cancelledByName: string;
  restoredAt: string | null;
  restoredById: string | null;
  restoredByName: string | null;
  kind: TQuotationCancellationKind;
  fromStatus: TQuotationRestorableStatus;
}

export interface IQuotationSalesAgent {
  id: string;
  lastName: string;
  firstName: string;
  employeeNumber: string;
}
