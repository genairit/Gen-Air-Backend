import Decimal from 'decimal.js';
import { PAYMENT_TERMS } from '@Constants/payment-terms.constant';
import type { IQuotationDocument } from '../interfaces/quotation-document.interface';

interface IQuotationPaymentIssues {
  terms: string[];
  schedule: string[];
}

export const quotationPaymentIssues = (
  quotation: Pick<
    IQuotationDocument,
    'paymentTerms' | 'paymentTermsNote' | 'paymentSchedule'
  >,
): IQuotationPaymentIssues => {
  const terms: string[] = [];
  const schedule: string[] = [];
  const hasStages = quotation.paymentSchedule.length > 0;
  if (hasStages && quotation.paymentTerms !== null) {
    terms.push('נבחרו גם תנאי תשלום קבועים וגם שלבי תשלום');
  }
  if (!hasStages && quotation.paymentTerms === null) {
    terms.push('לא נבחרו תנאי תשלום');
  }
  if (
    !hasStages &&
    quotation.paymentTerms === PAYMENT_TERMS.OTHER &&
    !quotation.paymentTermsNote.trim()
  ) {
    terms.push('נדרש פירוט לתנאי תשלום אחרים');
  }
  if (!hasStages) {
    return { terms, schedule };
  }
  const total = quotation.paymentSchedule.reduce(
    (result, stage) => result.plus(stage.percent),
    new Decimal(0),
  );
  if (!total.equals(100)) {
    schedule.push(`תנאי התשלום מסתכמים ל-${total.toString()}% במקום 100%`);
  }
  if (quotation.paymentSchedule.some((stage) => !stage.text.trim())) {
    schedule.push('יש לתאר את מועד התשלום של כל שלב');
  }
  return { terms, schedule };
};
