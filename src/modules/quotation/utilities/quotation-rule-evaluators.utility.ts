import {
  SYSTEM_TYPE,
  EQUIPMENT_ROLE,
  CATALOGUE_STATUS,
  CATALOGUE_PREFERENCE,
  QUOTATION_DECIMAL as Decimal,
} from '../constants/quotation.constant';

import type {
  IQuotationCircuit,
  IQuotationRuleContext,
  IQuotationWarningCandidate,
} from '../interfaces/quotation-rule-evaluation.interface';

import {
  QUOTATION_RULE,
  RULE_PARAMETER,
  type TQuotationRuleKey,
} from '@Modules/quotation-rule/constants/quotation-rule.constant';

import { PAYMENT_TERMS } from '@Constants/payment-terms.constant';
import type { IQuotationDocument } from '../interfaces/quotation-document.interface';
import { ruleParameter } from '@Modules/quotation-rule/utilities/quotation-rule.utility';
import type { IQuotationItem } from '@Modules/quotation-item/interfaces/quotation-item.interface';

const lines = (quotation: IQuotationDocument): IQuotationItem[] =>
  quotation.sections.flatMap((section) => section.items);
const candidate = (
  context: string,
  text: string,
): IQuotationWarningCandidate => ({ context, text });
const hasIndoor = (items: IQuotationItem[]): boolean =>
  items.some((item) => item.equipmentRole === EQUIPMENT_ROLE.INDOOR);
const hasRole = (items: IQuotationItem[], role: string): boolean =>
  items.some(
    (item) => item.equipmentRole === role && new Decimal(item.quantity).gt(0),
  );
const missingController = (
  item: IQuotationItem,
  items: IQuotationItem[],
): boolean =>
  item.equipmentRole === EQUIPMENT_ROLE.INDOOR &&
  !item.includesRemote &&
  !item.includesThermostat &&
  !items.some(
    (child) =>
      child.parentItemId === item.id &&
      child.equipmentRole === EQUIPMENT_ROLE.CONTROL,
  );
export const quotationCircuits = (
  quotation: IQuotationDocument,
): IQuotationCircuit[] => {
  const equipment = quotation.sections
    .filter((section) => section.systemType === SYSTEM_TYPE.VRF)
    .flatMap((section) => section.items)
    .filter((item) =>
      [EQUIPMENT_ROLE.INDOOR, EQUIPMENT_ROLE.OUTDOOR].some(
        (role) => role === item.equipmentRole,
      ),
    );
  const circuits = equipment.reduce<Record<string, IQuotationCircuit>>(
    (result, item) => {
      const name = item.circuit ?? 'A';
      const previous = result[name] ?? { name, indoor: '0', outdoor: '0' };
      const capacity = new Decimal(item.capacityBtu ?? 0).times(item.quantity);
      const updated =
        item.equipmentRole === EQUIPMENT_ROLE.INDOOR
          ? { ...previous, indoor: capacity.plus(previous.indoor).toString() }
          : {
              ...previous,
              outdoor: capacity.plus(previous.outdoor).toString(),
            };
      return { ...result, [name]: updated };
    },
    {},
  );
  return Object.values(circuits);
};
const hasRatioViolation = (
  circuit: IQuotationCircuit,
  context: IQuotationRuleContext,
): boolean => {
  if (
    new Decimal(circuit.outdoor).isZero() ||
    new Decimal(circuit.indoor).isZero()
  ) {
    return false;
  }
  const ratio = new Decimal(circuit.indoor).div(circuit.outdoor);
  return (
    ratio.lt(
      ruleParameter(
        context.configuration,
        QUOTATION_RULE.VRF_RATIO,
        RULE_PARAMETER.MINIMUM_RATIO,
      ),
    ) ||
    ratio.gt(
      ruleParameter(
        context.configuration,
        QUOTATION_RULE.VRF_RATIO,
        RULE_PARAMETER.MAXIMUM_RATIO,
      ),
    )
  );
};
const capacityMismatch = (
  item: IQuotationItem,
  context: IQuotationRuleContext,
): boolean => {
  if (!item.capacityBtu || !item.requestedCapacityBtu) {
    return false;
  }
  const deviation = new Decimal(item.capacityBtu)
    .minus(item.requestedCapacityBtu)
    .abs()
    .div(item.requestedCapacityBtu);
  return deviation.gt(
    ruleParameter(
      context.configuration,
      QUOTATION_RULE.CAPACITY_DISTANCE,
      RULE_PARAMETER.MAXIMUM_DEVIATION,
    ),
  );
};
export const QUOTATION_RULE_EVALUATORS: Record<
  TQuotationRuleKey,
  (context: IQuotationRuleContext) => IQuotationWarningCandidate[]
> = {
  [QUOTATION_RULE.VRF_HEADERS]: ({ quotation }) =>
    quotation.sections
      .filter(
        (section) =>
          section.systemType === SYSTEM_TYPE.VRF &&
          hasIndoor(section.items) &&
          !hasRole(section.items, EQUIPMENT_ROLE.HEADER),
      )
      .map((section) => candidate(section.id, 'לא נבחרו חנוכיות למערכת')),
  [QUOTATION_RULE.VRF_CONTROLS]: ({ quotation }) =>
    quotation.sections
      .filter((section) => section.systemType === SYSTEM_TYPE.VRF)
      .flatMap((section) =>
        section.items.filter((item) => missingController(item, section.items)),
      )
      .map((item) =>
        candidate(item.id, `${item.description}: אין טרמוסטט או שלט`),
      ),
  [QUOTATION_RULE.PIPING]: ({ quotation }) =>
    quotation.sections
      .filter(
        (section) =>
          [SYSTEM_TYPE.MULTI, SYSTEM_TYPE.SINGLE].some(
            (type) => type === section.systemType,
          ) && !hasRole(section.items, EQUIPMENT_ROLE.PIPE),
      )
      .map((section) => candidate(section.id, 'לא הוזנה כמות צנרת למערכת')),
  [QUOTATION_RULE.ZERO_PRICE]: ({ quotation }) =>
    lines(quotation)
      .filter((item) => new Decimal(item.quotedPrice).isZero())
      .map((item) => candidate(item.id, `${item.description}: מחיר 0`)),
  [QUOTATION_RULE.DO_NOT_SELL]: ({ quotation }) =>
    lines(quotation)
      .filter((item) => item.catalogueStatus === CATALOGUE_STATUS.NO_SELL)
      .map((item) => candidate(item.id, `${item.description}: מסומן לא למכור`)),
  [QUOTATION_RULE.LESS_USEFUL]: ({ quotation }) =>
    lines(quotation)
      .filter((item) => item.cataloguePreference === CATALOGUE_PREFERENCE.LESS)
      .map((item) =>
        candidate(item.id, `${item.description}: פריט פחות שימושי`),
      ),
  [QUOTATION_RULE.CAPACITY_DISTANCE]: (context) =>
    lines(context.quotation)
      .filter((item) => capacityMismatch(item, context))
      .map((item) =>
        candidate(
          item.id,
          `${item.description}: הדגם רחוק ביותר מ-${ruleParameter(context.configuration, QUOTATION_RULE.CAPACITY_DISTANCE, RULE_PARAMETER.MAXIMUM_DEVIATION) * 100}% מהגודל המבוקש`,
        ),
      ),
  [QUOTATION_RULE.MISSING_OUTDOOR]: ({ quotation }) =>
    quotationCircuits(quotation)
      .filter(
        (circuit) =>
          new Decimal(circuit.outdoor).isZero() &&
          new Decimal(circuit.indoor).gt(0),
      )
      .map((circuit) =>
        candidate(
          circuit.name,
          `מעגל ${circuit.name}: יש יחידות פנימיות בלי מעבה`,
        ),
      ),
  [QUOTATION_RULE.MISSING_INDOOR]: ({ quotation }) =>
    quotationCircuits(quotation)
      .filter(
        (circuit) =>
          new Decimal(circuit.indoor).isZero() &&
          new Decimal(circuit.outdoor).gt(0),
      )
      .map((circuit) =>
        candidate(
          circuit.name,
          `מעגל ${circuit.name}: מעבה בלי יחידות פנימיות`,
        ),
      ),
  [QUOTATION_RULE.VRF_RATIO]: (context) =>
    quotationCircuits(context.quotation)
      .filter((circuit) => hasRatioViolation(circuit, context))
      .map((circuit) =>
        candidate(
          circuit.name,
          `מעגל ${circuit.name}: דיוורסיטי מחוץ לטווח 1:${ruleParameter(context.configuration, QUOTATION_RULE.VRF_RATIO, RULE_PARAMETER.MINIMUM_RATIO)}–1:${ruleParameter(context.configuration, QUOTATION_RULE.VRF_RATIO, RULE_PARAMETER.MAXIMUM_RATIO)} (${new Decimal(circuit.indoor).div(circuit.outdoor).toFixed(2)})`,
        ),
      ),
  [QUOTATION_RULE.PAYMENT_TERMS]: ({ quotation }) => {
    if (!quotation.paymentTerms) {
      return [candidate('payment', 'לא נבחרו תנאי תשלום')];
    }
    if (
      quotation.paymentTerms === PAYMENT_TERMS.OTHER &&
      !quotation.paymentTermsNote.trim()
    ) {
      return [candidate('payment', 'נדרש פירוט לתנאי תשלום אחרים')];
    }
    return [];
  },
  [QUOTATION_RULE.PAYMENT_SCHEDULE]: ({ quotation }) => {
    if (!quotation.paymentSchedule.length) {
      return [];
    }
    const sum = quotation.paymentSchedule.reduce(
      (result, stage) => result.plus(stage.percent),
      new Decimal(0),
    );
    return sum.equals(100)
      ? []
      : [
          candidate(
            'payment',
            `תנאי התשלום מסתכמים ל-${sum.toString()}% במקום 100%`,
          ),
        ];
  },
};
