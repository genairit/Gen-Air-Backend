import { PAYMENT_TERMS } from '@Constants/payment-terms.constant';
import type { IQuotationDocument } from '../interfaces/quotation-document.interface';
import { paymentConfigurationIssues } from '@Utilities/payment-configuration.utility';
import type { IPaymentConfigurationIssues } from '@Interfaces/payment-configuration.interface';

export const quotationPaymentIssues = (
  quotation: Pick<
    IQuotationDocument,
    'paymentTerms' | 'paymentTermsNote' | 'paymentSchedule'
  >,
): IPaymentConfigurationIssues => {
  const issues = paymentConfigurationIssues(quotation);
  const hasStages = quotation.paymentSchedule.length > 0;
  const missingTerms = !hasStages && quotation.paymentTerms === null;
  if (missingTerms) {
    issues.terms.push('לא נבחרו תנאי תשלום');
  }

  const isOther = quotation.paymentTerms === PAYMENT_TERMS.OTHER;
  const missingNote = !quotation.paymentTermsNote.trim();
  const needsNote = !hasStages && isOther && missingNote;
  if (needsNote) {
    issues.terms.push('נדרש פירוט לתנאי תשלום אחרים');
  }

  return issues;
};
