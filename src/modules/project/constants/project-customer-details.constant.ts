import {
  IProjectCustomerDetails,
  ProjectCustomerDetailFieldType,
} from '../interfaces/project.interface';

import {
  PROJECT_DETAIL_FIELD_SETS,
  ProjectDetailFieldSetType,
} from '@Constants/project-detail-field-set.constant';

export const EMPTY_CUSTOMER_DETAILS: IProjectCustomerDetails = {
  customerName: null,
  customerCity: null,
  customerUnit: null,
  customerFloor: null,
  customerPhone: null,
  customerEmail: null,
  customerAddress: null,
  customerApartment: null,
  customerCompanyNumber: null,
  customerAssociationNumber: null,
};

export const PROJECT_CUSTOMER_DETAIL_FIELDS = Object.keys(
  EMPTY_CUSTOMER_DETAILS,
).filter(
  (key): key is ProjectCustomerDetailFieldType => key in EMPTY_CUSTOMER_DETAILS,
);

export const CUSTOMER_DETAIL_FIELDS_BY_SET: Record<
  ProjectDetailFieldSetType,
  ProjectCustomerDetailFieldType[]
> = {
  [PROJECT_DETAIL_FIELD_SETS.COMPANY]: [
    'customerName',
    'customerCompanyNumber',
    'customerAddress',
    'customerPhone',
    'customerEmail',
  ],
  [PROJECT_DETAIL_FIELD_SETS.PRIVATE_CLIENT]: [
    'customerName',
    'customerAddress',
    'customerCity',
    'customerPhone',
    'customerEmail',
    'customerFloor',
    'customerApartment',
  ],
  [PROJECT_DETAIL_FIELD_SETS.INSTITUTION]: [
    'customerName',
    'customerAssociationNumber',
    'customerPhone',
    'customerAddress',
    'customerEmail',
    'customerFloor',
    'customerUnit',
  ],
};
