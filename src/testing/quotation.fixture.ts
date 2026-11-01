import {
  QUOTATION_RULE,
  QUOTATION_RULE_KEYS,
} from '@Modules/quotation-rule/constants/quotation-rule.constant';

import { randomUUID } from 'node:crypto';
import type { IQuotationRule } from '@Modules/quotation-rule/interfaces/quotation-rule.interface';
import type { IQuotationItem } from '@Modules/quotation-item/interfaces/quotation-item.interface';
import { validateRuleConfiguration } from '@Modules/quotation-rule/utilities/quotation-rule.utility';
import type { IQuotationDocument } from '@Modules/quotation/interfaces/quotation-document.interface';

const parameters = (key: string): { [parameter: string]: number } => {
  if (key === QUOTATION_RULE.CAPACITY_DISTANCE) {
    return { maximumDeviation: 0.12 };
  }
  if (key === QUOTATION_RULE.VRF_RATIO) {
    return { minimumRatio: 1, maximumRatio: 2 };
  }
  return {};
};
export const quotationRuleFixture = (enabled: string[]): IQuotationRule[] =>
  QUOTATION_RULE_KEYS.map((key) => ({
    key,
    enabled: enabled.includes(key),
    version: 1,
    parameters: parameters(key),
  }));
export const quotationItemFixture = (): IQuotationItem => ({
  id: randomUUID(),
  sectionId: 'section',
  catalogueItemId: randomUUID(),
  parentItemId: null,
  sku: 'SKU',
  description: 'פריט בדיקה',
  unit: 'יח׳',
  quotedPrice: '10',
  quantity: '1',
  equipmentRole: 'unit',
  equipmentType: null,
  capacityBtu: 24000,
  requestedCapacityBtu: null,
  location: '',
  circuit: null,
  displayOrder: 0,
  controlKind: null,
  catalogueStatus: 'active',
  cataloguePreference: '',
  includesRemote: false,
  includesThermostat: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
});
export const quotationDocumentFixture = (
  enabled: string[],
): IQuotationDocument => {
  const configuration = validateRuleConfiguration(
    quotationRuleFixture(enabled),
  );
  return {
    id: randomUUID(),
    number: '2610-000001',
    customerId: randomUUID(),
    projectId: null,
    status: 'draft',
    date: '2026-10-31',
    brand: 'אלקטרה',
    paymentTerms: 'prepaid',
    paymentTermsNote: '',
    paymentSchedule: [],
    discountPercent: '0',
    targetPretaxAmount: null,
    vatRate: '18',
    internalNotes: '',
    version: 1,
    acknowledgedWarnings: [],
    ruleConfiguration: configuration.rules,
    ruleConfigFingerprint: configuration.fingerprint,
    createdById: randomUUID(),
    updatedById: randomUUID(),
    approvedById: null,
    approvedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    sections: [
      {
        id: 'section',
        quotationId: 'quotation',
        title: 'מערכת',
        systemType: 'GEN',
        displayOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        items: [quotationItemFixture()],
      },
    ],
  };
};
