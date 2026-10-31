import { APARTMENT_IMPORT_COLUMNS } from './apartment-import.constant';
import { CreateCustomerDto } from '@Modules/customer/dto/create-customer.dto';
import { PROJECT_DETAIL_FIELD_SETS } from '@Constants/project-detail-field-set.constant';

export type ApartmentImportColumnKeyType =
  (typeof APARTMENT_IMPORT_COLUMNS)[number]['key'];

export const APARTMENT_IMPORT_CUSTOMER_FIELDS = {
  name: 'customerName',
  taxId: 'customerTaxId',
  address: 'customerAddress',
  contactName: 'contactName',
  phone: 'customerPhone',
  email: 'customerEmail',
  customerType: 'customerType',
} as const satisfies Record<
  Exclude<keyof CreateCustomerDto, 'paymentTerms'>,
  ApartmentImportColumnKeyType
>;

export const APARTMENT_IMPORT_CUSTOMER_TYPES = [
  { label: 'חברה', value: PROJECT_DETAIL_FIELD_SETS.COMPANY },
  { label: 'מוסד', value: PROJECT_DETAIL_FIELD_SETS.INSTITUTION },
  { label: 'לקוח פרטי', value: PROJECT_DETAIL_FIELD_SETS.PRIVATE_CLIENT },
] as const;

export const APARTMENT_IMPORT_CUSTOMER_COMPARISON = {
  TEXT: 'text',
  EMAIL: 'email',
  PHONE: 'phone',
  TYPE: 'type',
} as const;

export const APARTMENT_IMPORT_CUSTOMER_COMPARISON_FIELDS = [
  { field: 'name', mode: APARTMENT_IMPORT_CUSTOMER_COMPARISON.TEXT },
  { field: 'taxId', mode: APARTMENT_IMPORT_CUSTOMER_COMPARISON.TEXT },
  { field: 'address', mode: APARTMENT_IMPORT_CUSTOMER_COMPARISON.TEXT },
  { field: 'email', mode: APARTMENT_IMPORT_CUSTOMER_COMPARISON.EMAIL },
  { field: 'phone', mode: APARTMENT_IMPORT_CUSTOMER_COMPARISON.PHONE },
  { field: 'customerType', mode: APARTMENT_IMPORT_CUSTOMER_COMPARISON.TYPE },
] as const;
