import {
  IProjectContact,
  IProjectPaymentTerms,
} from '../interfaces/project.interface';

import {
  PAYMENT_TERMS,
  PaymentTermsType,
} from '@Constants/payment-terms.constant';

import {
  PROJECT_DETAIL_FIELD_SETS,
  ProjectDetailFieldSetType,
} from '@Constants/project-detail-field-set.constant';

export const EMPTY_CONTACT: IProjectContact = {
  contactName: null,
  contactRole: null,
  contactPhone: null,
};

export const CONTACT_FIELDS = Object.keys(EMPTY_CONTACT).filter(
  (key): key is keyof IProjectContact => key in EMPTY_CONTACT,
);

export const EMPTY_PAYMENT_TERMS: IProjectPaymentTerms = {
  paymentTerms: null,
  paymentTermsNote: null,
};

export const PAYMENT_TERMS_FIELDS = Object.keys(EMPTY_PAYMENT_TERMS).filter(
  (key): key is keyof IProjectPaymentTerms => key in EMPTY_PAYMENT_TERMS,
);

const BUSINESS_PAYMENT_TERMS: readonly PaymentTermsType[] = [
  PAYMENT_TERMS.MILESTONES_NET_60,
  PAYMENT_TERMS.TWELVE_PREPAID_CHECKS,
  PAYMENT_TERMS.OTHER,
];

export const PAYMENT_TERMS_BY_FIELD_SET: Record<
  ProjectDetailFieldSetType,
  readonly PaymentTermsType[]
> = {
  [PROJECT_DETAIL_FIELD_SETS.COMPANY]: BUSINESS_PAYMENT_TERMS,
  [PROJECT_DETAIL_FIELD_SETS.INSTITUTION]: BUSINESS_PAYMENT_TERMS,
  [PROJECT_DETAIL_FIELD_SETS.PRIVATE_CLIENT]: [
    PAYMENT_TERMS.INSTALLMENTS_10_60_30,
    PAYMENT_TERMS.PREPAID,
    PAYMENT_TERMS.OTHER,
  ],
};

export const ADDRESS_CITY_REQUIRED_BY_FIELD_SET: Record<
  ProjectDetailFieldSetType,
  boolean
> = {
  [PROJECT_DETAIL_FIELD_SETS.COMPANY]: false,
  [PROJECT_DETAIL_FIELD_SETS.INSTITUTION]: false,
  [PROJECT_DETAIL_FIELD_SETS.PRIVATE_CLIENT]: true,
};
