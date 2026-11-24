import type { IQuotation } from './quotation.interface';
import type { TQuotationStatus } from '../constants/quotation.constant';
import type { QuotationLifecycleActionType } from '../constants/quotation-lifecycle.constant';

export interface IQuotationLifecycleEvent {
  id: string;
  actorId: string;
  actorName: string;
  occurredAt: string;
  quotationId: string;
  reason: string | null;
  quotationVersion: number;
  toStatus: TQuotationStatus;
  fromStatus: TQuotationStatus;
  action: QuotationLifecycleActionType;
}

export interface IQuotationLifecycleRecord extends IQuotationLifecycleEvent {
  evidence: Pick<
    IQuotation,
    | 'approvedAt'
    | 'approvedById'
    | 'acknowledgedWarnings'
    | 'ruleConfiguration'
    | 'paymentTerms'
    | 'paymentTermsNote'
    | 'paymentSchedule'
    | 'rejectionHistory'
    | 'cancellationHistory'
  >;
}
