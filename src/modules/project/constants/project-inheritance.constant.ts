import { TInheritedProjectField } from '../interfaces/project.interface';

export const ADDRESS_INHERITED_FIELDS: readonly TInheritedProjectField[] = [
  'address',
  'addressCity',
  'addressPlaceId',
];

export const PAYMENT_TERMS_INHERITED_FIELDS: readonly TInheritedProjectField[] =
  ['paymentTerms', 'paymentTermsNote'];

export const BUILDING_INHERITANCE_ATTRIBUTES = [
  'id',
  'code',
  'name',
  'notes',
  ...ADDRESS_INHERITED_FIELDS,
  ...PAYMENT_TERMS_INHERITED_FIELDS,
];
