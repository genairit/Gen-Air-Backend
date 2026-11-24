import {
  copyPaymentConfiguration,
  paymentConfigurationIssues,
} from '@Utilities/payment-configuration.utility';

import { BadRequestException } from '@nestjs/common';
import { PAYMENT_TERMS } from '@Constants/payment-terms.constant';
import { HTTP_ERROR_CODES } from '@Constants/http-error-code.constant';
import type { IPaymentConfiguration } from '@Interfaces/payment-configuration.interface';
import { PAYMENT_CONFIGURATION_MESSAGES } from '@Constants/payment-configuration.constant';

export const validateCustomerPaymentConfiguration = (
  configuration: IPaymentConfiguration,
  previous?: IPaymentConfiguration,
): void => {
  const issues = paymentConfigurationIssues(configuration);
  const isLegacyOther = configuration.paymentTerms === PAYMENT_TERMS.OTHER;
  const previousOther = previous?.paymentTerms === PAYMENT_TERMS.OTHER;
  const previousEmpty = previous?.paymentSchedule.length === 0;
  const currentEmpty = configuration.paymentSchedule.length === 0;
  const unchangedLegacy = previousOther && previousEmpty && currentEmpty;
  const invalidOther = isLegacyOther && !unchangedLegacy;
  const messages = [
    ...issues.terms,
    ...issues.schedule,
    ...(invalidOther ? [PAYMENT_CONFIGURATION_MESSAGES.CUSTOM_REQUIRED] : []),
  ];
  if (messages.length === 0) {
    return;
  }

  throw new BadRequestException({
    code: HTTP_ERROR_CODES.INVALID_CUSTOMER_PAYMENT_CONFIGURATION,
    message: messages.join('. '),
  });
};

export const resolveCustomerPaymentUpdate = (
  changes: Partial<IPaymentConfiguration>,
  current: Partial<IPaymentConfiguration>,
): Partial<IPaymentConfiguration> => {
  const hasTerms = 'paymentTerms' in changes;
  const hasSchedule = 'paymentSchedule' in changes;
  if (!hasTerms && !hasSchedule) {
    return {};
  }

  const previous = {
    paymentTerms: current.paymentTerms ?? null,
    paymentSchedule: current.paymentSchedule ?? [],
  };
  const payment = copyPaymentConfiguration({
    paymentTerms: hasTerms
      ? (changes.paymentTerms ?? null)
      : previous.paymentTerms,
    paymentSchedule: hasSchedule
      ? (changes.paymentSchedule ?? [])
      : previous.paymentSchedule,
  });
  validateCustomerPaymentConfiguration(payment, previous);
  return payment;
};

export const customerPaymentSnapshot = (
  customer: Partial<IPaymentConfiguration>,
): IPaymentConfiguration => {
  const configuration = {
    paymentTerms: customer.paymentTerms ?? null,
    paymentSchedule: customer.paymentSchedule ?? [],
  };
  const issues = paymentConfigurationIssues(configuration);
  const unconfigured = configuration.paymentTerms === PAYMENT_TERMS.OTHER;
  const hasIssues = issues.terms.length > 0 || issues.schedule.length > 0;
  if (unconfigured || hasIssues) {
    return { paymentTerms: null, paymentSchedule: [] };
  }

  return copyPaymentConfiguration(configuration);
};
