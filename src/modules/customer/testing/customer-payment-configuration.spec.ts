import {
  customerPaymentSnapshot,
  validateCustomerPaymentConfiguration,
} from '../utilities/customer-payment.utility';

import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { BadRequestException } from '@nestjs/common';
import type { ClassConstructor } from 'class-transformer';
import { CreateCustomerDto } from '../dto/create-customer.dto';
import { UpdateCustomerDto } from '../dto/update-customer.dto';
import { PAYMENT_TERMS } from '@Constants/payment-terms.constant';
import type { IPaymentConfiguration } from '@Interfaces/payment-configuration.interface';
import { PROJECT_DETAIL_FIELD_SETS } from '@Constants/project-detail-field-set.constant';

const customConfiguration = (): IPaymentConfiguration => ({
  paymentTerms: null,
  paymentSchedule: [
    { percent: '33.3333', text: 'בחתימה' },
    { percent: '66.6667', text: 'במסירה' },
  ],
});

const dtoErrors = async (
  dto: ClassConstructor<object>,
  paymentSchedule: unknown,
) =>
  validate(
    plainToInstance(dto, {
      name: 'לקוח לבדיקה',
      taxId: '514287937',
      address: 'הרצל 12 תל אביב',
      customerType: PROJECT_DETAIL_FIELD_SETS.COMPANY,
      paymentTerms: null,
      paymentSchedule,
    }),
    { whitelist: true, forbidNonWhitelisted: true },
  );

describe('customer payment configuration', () => {
  it('accepts an exact decimal split without binary floating point rounding', () => {
    expect(() =>
      validateCustomerPaymentConfiguration(customConfiguration()),
    ).not.toThrow();
  });

  it.each([
    { paymentTerms: null, paymentSchedule: [] },
    ...Object.values(PAYMENT_TERMS)
      .filter((term) => term !== PAYMENT_TERMS.OTHER)
      .map((paymentTerms) => ({ paymentTerms, paymentSchedule: [] })),
  ])('allows unset or configured preset defaults: %j', (configuration) => {
    expect(() =>
      validateCustomerPaymentConfiguration(configuration),
    ).not.toThrow();
  });

  it.each<IPaymentConfiguration>([
    { ...customConfiguration(), paymentTerms: PAYMENT_TERMS.PREPAID },
    {
      paymentTerms: null,
      paymentSchedule: [{ percent: '99.9999', text: 'בחתימה' }],
    },
    { paymentTerms: null, paymentSchedule: [{ percent: '100', text: '   ' }] },
    {
      paymentTerms: null,
      paymentSchedule: [{ percent: '100.0001', text: 'בחתימה' }],
    },
    {
      paymentTerms: null,
      paymentSchedule: [{ percent: '-1', text: 'בחתימה' }],
    },
    {
      paymentTerms: null,
      paymentSchedule: [{ percent: '1e2', text: 'בחתימה' }],
    },
    {
      paymentTerms: null,
      paymentSchedule: [{ percent: '99.99999', text: 'בחתימה' }],
    },
    {
      paymentTerms: null,
      paymentSchedule: [{ percent: '100', text: 'א'.repeat(301) }],
    },
    {
      paymentTerms: null,
      paymentSchedule: Array.from({ length: 31 }, (_, index) => ({
        percent: index === 0 ? '100' : '0',
        text: 'שלב תשלום',
      })),
    },
  ])('rejects invalid configured defaults: %j', (configuration) => {
    expect(() => validateCustomerPaymentConfiguration(configuration)).toThrow(
      BadRequestException,
    );
  });

  it('retains legacy Other only when it was already stored and unchanged', () => {
    const legacy = { paymentTerms: PAYMENT_TERMS.OTHER, paymentSchedule: [] };
    expect(() => validateCustomerPaymentConfiguration(legacy)).toThrow(
      BadRequestException,
    );
    expect(() =>
      validateCustomerPaymentConfiguration(legacy, legacy),
    ).not.toThrow();
    expect(() =>
      validateCustomerPaymentConfiguration(legacy, {
        paymentTerms: PAYMENT_TERMS.PREPAID,
        paymentSchedule: [],
      }),
    ).toThrow(BadRequestException);
  });

  it('copies configured stages into an independent quotation snapshot', () => {
    const configuration = customConfiguration();
    const snapshot = customerPaymentSnapshot(configuration);
    expect(snapshot).toEqual(configuration);
    expect(snapshot.paymentSchedule).not.toBe(configuration.paymentSchedule);
    expect(snapshot.paymentSchedule[0]).not.toBe(
      configuration.paymentSchedule[0],
    );
    snapshot.paymentSchedule[0].text = 'מועד אחר בהצעה';
    expect(configuration.paymentSchedule[0].text).toBe('בחתימה');
  });

  it.each([
    {},
    { paymentTerms: null, paymentSchedule: [] },
    { paymentTerms: PAYMENT_TERMS.OTHER, paymentSchedule: [] },
    { paymentTerms: null, paymentSchedule: [{ percent: '60', text: 'חלקי' }] },
  ])(
    'uses the normal unset fallback for unconfigured legacy values: %j',
    (customer) => {
      expect(customerPaymentSnapshot(customer)).toEqual({
        paymentTerms: null,
        paymentSchedule: [],
      });
    },
  );
});

describe.each([CreateCustomerDto, UpdateCustomerDto])(
  '%s payment stage DTO',
  (dto) => {
    it('validates supported stage shape through nested class transformation', async () => {
      expect(
        await dtoErrors(dto, customConfiguration().paymentSchedule),
      ).toEqual([]);
    });

    it.each([
      null,
      'invalid',
      {},
      [null],
      [{ percent: 100, text: 'בחתימה' }],
      [{ percent: '100' }],
      [{ text: 'בחתימה' }],
      [{ percent: '100', text: 'בחתימה', injected: 'field' }],
      [{ percent: '1e2', text: 'בחתימה' }],
      [{ percent: '99.99999', text: 'בחתימה' }],
      [{ percent: '100', text: 'א'.repeat(301) }],
      Array.from({ length: 31 }, () => ({ percent: '0', text: 'שלב' })),
    ])(
      'rejects malformed schedule input before customer persistence: %j',
      async (input) => {
        expect(await dtoErrors(dto, input)).not.toHaveLength(0);
      },
    );
  },
);
