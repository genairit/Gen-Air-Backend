import { PAYMENT_TERMS } from '@Constants/payment-terms.constant';
import { quotationPaymentIssues } from './quotation-payment.utility';

describe('quotation payment agreement', () => {
  test('a custom 30/70 schedule replaces an upfront term and needs dated stages', () => {
    const quotation = {
      paymentTerms: PAYMENT_TERMS.PREPAID,
      paymentTermsNote: '',
      paymentSchedule: [
        { percent: '30', text: 'בחתימה' },
        { percent: '70', text: 'במסירה' },
      ],
    };
    expect(quotationPaymentIssues(quotation).terms).toContain(
      'נבחרו גם תנאי תשלום קבועים וגם שלבי תשלום',
    );
    expect(
      quotationPaymentIssues({ ...quotation, paymentTerms: null }),
    ).toEqual({
      terms: [],
      schedule: [],
    });
    expect(
      quotationPaymentIssues({
        ...quotation,
        paymentTerms: null,
        paymentSchedule: [
          { percent: '30', text: '' },
          { percent: '70', text: 'במסירה' },
        ],
      }).schedule,
    ).toContain('יש לתאר את מועד התשלום של כל שלב');
  });

  test('a fixed term needs no stages and custom stages need a complete split', () => {
    const quotation = {
      paymentTerms: PAYMENT_TERMS.PREPAID,
      paymentTermsNote: '',
      paymentSchedule: [],
    };
    expect(quotationPaymentIssues(quotation)).toEqual({
      terms: [],
      schedule: [],
    });
    expect(
      quotationPaymentIssues({ ...quotation, paymentTerms: null }).terms,
    ).toContain('לא נבחרו תנאי תשלום');
    expect(
      quotationPaymentIssues({
        ...quotation,
        paymentTerms: null,
        paymentSchedule: [{ percent: '30', text: 'בחתימה' }],
      }).schedule,
    ).toContain('תנאי התשלום מסתכמים ל-30% במקום 100%');
  });
});
