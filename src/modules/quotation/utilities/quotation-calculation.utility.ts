import type {
  IQuotationView,
  IQuotationTotals,
  IQuotationWarning,
  IQuotationDocument,
} from '../interfaces/quotation-document.interface';

import { createHash } from 'node:crypto';
import { QUOTATION_DECIMAL as Decimal } from '../constants/quotation.constant';
import { QUOTATION_RULE_EVALUATORS } from './quotation-rule-evaluators.utility';
import { validateRuleConfiguration } from '@Modules/quotation-rule/utilities/quotation-rule.utility';

export const calculateQuotation = (
  quotation: IQuotationDocument,
): IQuotationTotals => {
  const items = quotation.sections.flatMap((section) => section.items);
  const subtotal = items
    .reduce(
      (sum, item) =>
        sum.plus(
          new Decimal(item.quantity)
            .times(item.quotedPrice)
            .toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
        ),
      new Decimal(0),
    )
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const percent = new Decimal(quotation.discountPercent);
  const target = quotation.targetPretaxAmount;
  const pretax =
    target === null
      ? subtotal
          .times(new Decimal(100).minus(percent))
          .div(100)
          .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      : new Decimal(target);
  const vat = pretax
    .times(quotation.vatRate)
    .div(100)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return {
    subtotal: subtotal.toFixed(2),
    discount: subtotal.minus(pretax).toFixed(2),
    pretax: pretax.toFixed(2),
    vat: vat.toFixed(2),
    total: pretax.plus(vat).toFixed(2),
  };
};
export const quotationWarnings = (
  quotation: IQuotationDocument,
): IQuotationWarning[] => {
  const configuration = validateRuleConfiguration(quotation.ruleConfiguration);
  const candidates = configuration.rules
    .filter((rule) => rule.enabled)
    .flatMap((rule) =>
      QUOTATION_RULE_EVALUATORS[rule.key]({ quotation, configuration }),
    );
  return candidates.map((candidate) => {
    const key = createHash('sha256')
      .update(configuration.fingerprint + JSON.stringify(candidate))
      .digest('hex');
    return {
      key,
      text: candidate.text,
      acknowledged: quotation.acknowledgedWarnings.includes(key),
    };
  });
};
export const quotationView = (
  quotation: IQuotationDocument,
): IQuotationView => {
  return {
    ...quotation,
    totals: calculateQuotation(quotation),
    warnings: quotationWarnings(quotation),
  };
};
