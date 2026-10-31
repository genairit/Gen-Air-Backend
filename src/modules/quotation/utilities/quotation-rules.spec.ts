import {
  quotationWarnings,
  calculateQuotation,
} from './quotation-calculation.utility';

import {
  quotationRuleFixture,
  quotationItemFixture,
  quotationDocumentFixture,
} from '../../../testing/quotation.fixture';

import {
  QUOTATION_RULE,
  type TQuotationRuleKey,
} from '@Modules/quotation-rule/constants/quotation-rule.constant';

import type { IQuotationDocument } from '../interfaces/quotation-document.interface';
import { validateRuleConfiguration } from '@Modules/quotation-rule/utilities/quotation-rule.utility';

interface IWarningCase {
  rule: TQuotationRuleKey;
  change: (quotation: IQuotationDocument) => void;
}
const CASES: IWarningCase[] = [
  {
    rule: QUOTATION_RULE.ZERO_PRICE,
    change: (q) => {
      q.sections[0].items[0].quotedPrice = '0';
    },
  },
  {
    rule: QUOTATION_RULE.DO_NOT_SELL,
    change: (q) => {
      q.sections[0].items[0].catalogueStatus = 'nosell';
    },
  },
  {
    rule: QUOTATION_RULE.LESS_USEFUL,
    change: (q) => {
      q.sections[0].items[0].cataloguePreference = 'less';
    },
  },
  {
    rule: QUOTATION_RULE.CAPACITY_DISTANCE,
    change: (q) => {
      q.sections[0].items[0].requestedCapacityBtu = 40000;
    },
  },
  {
    rule: QUOTATION_RULE.PIPING,
    change: (q) => {
      q.sections[0].systemType = 'MULTI';
    },
  },
  {
    rule: QUOTATION_RULE.VRF_HEADERS,
    change: (q) => {
      q.sections[0].systemType = 'VRF';
      q.sections[0].items[0].equipmentRole = 'indoor';
    },
  },
  {
    rule: QUOTATION_RULE.VRF_CONTROLS,
    change: (q) => {
      q.sections[0].systemType = 'VRF';
      q.sections[0].items[0].equipmentRole = 'indoor';
    },
  },
  {
    rule: QUOTATION_RULE.MISSING_OUTDOOR,
    change: (q) => {
      q.sections[0].systemType = 'VRF';
      q.sections[0].items[0].equipmentRole = 'indoor';
    },
  },
  {
    rule: QUOTATION_RULE.MISSING_INDOOR,
    change: (q) => {
      q.sections[0].systemType = 'VRF';
      q.sections[0].items[0].equipmentRole = 'outdoor';
    },
  },
  {
    rule: QUOTATION_RULE.VRF_RATIO,
    change: (q) => {
      q.sections[0].systemType = 'VRF';
      q.sections[0].items[0].equipmentRole = 'indoor';
      q.sections[0].items.push({
        ...quotationItemFixture(),
        equipmentRole: 'outdoor',
        capacityBtu: 8000,
      });
    },
  },
  {
    rule: QUOTATION_RULE.PAYMENT_TERMS,
    change: (q) => {
      q.paymentTerms = null;
    },
  },
  {
    rule: QUOTATION_RULE.PAYMENT_SCHEDULE,
    change: (q) => {
      q.paymentSchedule = [{ percent: '50', text: 'מקדמה' }];
    },
  },
];
describe('All configured checks are required warnings', () => {
  test.each(CASES)(
    '$rule triggers a required warning and disabled configuration suppresses it',
    ({ rule, change }) => {
      const quote = quotationDocumentFixture([rule]);
      change(quote);
      const warnings = quotationWarnings(quote);
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.every((warning) => !warning.acknowledged)).toBe(true);
      expect(warnings.every((warning) => !('severity' in warning))).toBe(true);
      quote.ruleConfiguration = quotationRuleFixture([]);
      expect(quotationWarnings(quote)).toEqual([]);
    },
  );
  test('included remote or thermostat satisfies controller requirement without a second charge', () => {
    const quote = quotationDocumentFixture([QUOTATION_RULE.VRF_CONTROLS]);
    quote.sections[0].systemType = 'VRF';
    quote.sections[0].items[0].equipmentRole = 'indoor';
    quote.sections[0].items[0].includesRemote = true;
    expect(quotationWarnings(quote)).toEqual([]);
    quote.sections[0].items[0].includesRemote = false;
    quote.sections[0].items[0].includesThermostat = true;
    expect(quotationWarnings(quote)).toEqual([]);
  });
  test.each([1, 2])('VRF boundary ratio%s is allowed', (ratio) => {
    const quote = quotationDocumentFixture([QUOTATION_RULE.VRF_RATIO]);
    quote.sections[0].systemType = 'VRF';
    quote.sections[0].items[0].equipmentRole = 'indoor';
    quote.sections[0].items[0].capacityBtu = 24000 * ratio;
    quote.sections[0].items.push({
      ...quotationItemFixture(),
      equipmentRole: 'outdoor',
      capacityBtu: 24000,
    });
    expect(quotationWarnings(quote)).toEqual([]);
  });
  test('capacity threshold is read from database configuration and exact12percent is allowed', () => {
    const quote = quotationDocumentFixture([QUOTATION_RULE.CAPACITY_DISTANCE]);
    quote.sections[0].items[0].requestedCapacityBtu = 10000;
    quote.sections[0].items[0].capacityBtu = 11200;
    expect(quotationWarnings(quote)).toEqual([]);
    quote.sections[0].items[0].capacityBtu = 11201;
    expect(quotationWarnings(quote)).toHaveLength(1);
    const rule = quote.ruleConfiguration.find(
      (rule) => rule.key === QUOTATION_RULE.CAPACITY_DISTANCE,
    );
    if (!rule) {
      throw new Error('Missing test rule');
    }
    rule.parameters.maximumDeviation = 0.2;
    expect(quotationWarnings(quote)).toEqual([]);
  });
  test('line extensions and subtotal use identical half-up cent rounding', () => {
    const quote = quotationDocumentFixture([]);
    quote.sections[0].items[0].quotedPrice = '1.005';
    quote.sections[0].items.push({
      ...quotationItemFixture(),
      quotedPrice: '1.005',
    });
    expect(calculateQuotation(quote)).toMatchObject({
      subtotal: '2.02',
      vat: '0.36',
      total: '2.38',
    });
  });
  test('configuration fingerprint changes on version or threshold, ignoring row/key ordering', () => {
    const rules = quotationRuleFixture([]);
    const first = validateRuleConfiguration(rules);
    expect(validateRuleConfiguration([...rules].reverse()).fingerprint).toBe(
      first.fingerprint,
    );
    expect(
      validateRuleConfiguration(rules.map((rule) => ({ ...rule, version: 2 })))
        .fingerprint,
    ).not.toBe(first.fingerprint);
  });
  test('missing, duplicate and unknown parameter configurations fail closed', () => {
    const rules = quotationRuleFixture([]);
    expect(() => validateRuleConfiguration(rules.slice(1))).toThrow();
    expect(() =>
      validateRuleConfiguration([...rules.slice(1), rules[1]]),
    ).toThrow();
    expect(() =>
      validateRuleConfiguration(
        rules.map((rule) =>
          rule.key === QUOTATION_RULE.ZERO_PRICE
            ? { ...rule, parameters: { unexpected: 1 } }
            : rule,
        ),
      ),
    ).toThrow();
  });
  test('nonfinite and inverted ratio parameters fail closed', () => {
    const rules = quotationRuleFixture([]);
    expect(() =>
      validateRuleConfiguration(
        rules.map((rule) =>
          rule.key === QUOTATION_RULE.VRF_RATIO
            ? { ...rule, parameters: { minimumRatio: 3, maximumRatio: 2 } }
            : rule,
        ),
      ),
    ).toThrow();
    expect(() =>
      validateRuleConfiguration(
        rules.map((rule) =>
          rule.key === QUOTATION_RULE.CAPACITY_DISTANCE
            ? {
                ...rule,
                parameters: { maximumDeviation: Number.POSITIVE_INFINITY },
              }
            : rule,
        ),
      ),
    ).toThrow();
  });
});
