import {
  QUOTATION_RULE,
  QUOTATION_RULE_KEYS,
  RULE_PARAMETER_KEYS,
  type TQuotationRuleKey,
} from '../constants/quotation-rule.constant';

import { createHash } from 'node:crypto';
import type { IQuotationRule } from '../interfaces/quotation-rule.interface';
import type { IQuotationRuleConfiguration } from '../interfaces/quotation-rule-configuration.interface';

export const validateRuleConfiguration = (
  rules: IQuotationRule[],
): IQuotationRuleConfiguration => {
  if (
    rules.length !== QUOTATION_RULE_KEYS.length ||
    new Set(rules.map((rule) => rule.key)).size !== rules.length
  ) {
    throw new Error('Quotation rule configuration is incomplete');
  }
  for (const rule of rules) {
    if (
      !QUOTATION_RULE_KEYS.includes(rule.key) ||
      typeof rule.enabled !== 'boolean' ||
      !Number.isInteger(rule.version) ||
      rule.version < 1 ||
      !rule.parameters ||
      Array.isArray(rule.parameters)
    ) {
      throw new Error('Invalid quotation rule configuration');
    }
    const expected = RULE_PARAMETER_KEYS[rule.key] ?? [];
    if (
      Object.keys(rule.parameters).length !== expected.length ||
      expected.some(
        (key) =>
          typeof rule.parameters[key] !== 'number' ||
          !Number.isFinite(rule.parameters[key]) ||
          rule.parameters[key] < 0,
      )
    ) {
      throw new Error(`Invalid parameters for quotation rule ${rule.key}`);
    }
    if (
      rule.key === QUOTATION_RULE.VRF_RATIO &&
      rule.parameters.maximumRatio < rule.parameters.minimumRatio
    ) {
      throw new Error('Invalid VRF ratio interval');
    }
  }
  const normalized = QUOTATION_RULE_KEYS.map((key) => {
    const rule = rules.find((candidate) => candidate.key === key);
    if (!rule) {
      throw new Error('Missing quotation rule');
    }
    return {
      key,
      enabled: rule.enabled,
      version: rule.version,
      parameters: Object.fromEntries(
        Object.entries(rule.parameters).sort(([a], [b]) => a.localeCompare(b)),
      ),
    };
  });
  return {
    rules: normalized,
    fingerprint: createHash('sha256')
      .update(JSON.stringify(normalized))
      .digest('hex'),
  };
};
export const ruleEnabled = (
  configuration: IQuotationRuleConfiguration,
  key: TQuotationRuleKey,
): boolean => {
  return configuration.rules.some((rule) => rule.key === key && rule.enabled);
};
export const ruleParameter = (
  configuration: IQuotationRuleConfiguration,
  key: TQuotationRuleKey,
  parameter: string,
): number => {
  const value = configuration.rules.find((rule) => rule.key === key)
    ?.parameters[parameter];
  if (typeof value !== 'number') {
    throw new Error(`Missing parameter ${key}.${parameter}`);
  }
  return value;
};
