import {
  PAYMENT_CONFIGURATION_LIMITS,
  PAYMENT_CONFIGURATION_PATTERNS,
  PAYMENT_CONFIGURATION_MESSAGES,
} from '@Constants/payment-configuration.constant';

import type {
  IPaymentStage,
  IPaymentConfiguration,
  IPaymentConfigurationIssues,
} from '@Interfaces/payment-configuration.interface';

import Decimal from 'decimal.js';

const isValidPaymentStage = (stage: IPaymentStage): boolean => {
  const percentIsString = typeof stage.percent === 'string';
  const validPercentFormat =
    percentIsString &&
    PAYMENT_CONFIGURATION_PATTERNS.PERCENT.test(stage.percent);
  const textIsString = typeof stage.text === 'string';
  const validText =
    textIsString &&
    stage.text.length <= PAYMENT_CONFIGURATION_LIMITS.STAGE_TEXT;
  if (!validPercentFormat || !validText) {
    return false;
  }

  return new Decimal(stage.percent).lessThanOrEqualTo(
    PAYMENT_CONFIGURATION_LIMITS.TOTAL_PERCENT,
  );
};

export const paymentConfigurationIssues = (
  configuration: IPaymentConfiguration,
): IPaymentConfigurationIssues => {
  const terms: string[] = [];
  const schedule: string[] = [];
  const hasStages = configuration.paymentSchedule.length > 0;
  const hasFixedTerms = configuration.paymentTerms !== null;
  if (hasStages && hasFixedTerms) {
    terms.push(PAYMENT_CONFIGURATION_MESSAGES.CONFLICT);
  }

  if (!hasStages) {
    return { terms, schedule };
  }

  const validCount =
    configuration.paymentSchedule.length <= PAYMENT_CONFIGURATION_LIMITS.STAGES;
  const validStages = configuration.paymentSchedule.every(isValidPaymentStage);
  if (!validCount || !validStages) {
    schedule.push(PAYMENT_CONFIGURATION_MESSAGES.INVALID_STAGE);
    return { terms, schedule };
  }

  const total = configuration.paymentSchedule.reduce(
    (result, stage) => result.plus(stage.percent),
    new Decimal(0),
  );
  if (!total.equals(PAYMENT_CONFIGURATION_LIMITS.TOTAL_PERCENT)) {
    schedule.push(
      `תנאי התשלום מסתכמים ל-${total.toString()}% במקום ${PAYMENT_CONFIGURATION_LIMITS.TOTAL_PERCENT}%`,
    );
  }

  if (configuration.paymentSchedule.some((stage) => !stage.text.trim())) {
    schedule.push(PAYMENT_CONFIGURATION_MESSAGES.DESCRIPTION_REQUIRED);
  }

  return { terms, schedule };
};

export const copyPaymentConfiguration = (
  configuration: IPaymentConfiguration,
): IPaymentConfiguration => ({
  paymentTerms: configuration.paymentTerms,
  paymentSchedule: configuration.paymentSchedule.map((stage) => ({ ...stage })),
});
