import { TInheritedProjectField } from '../interfaces/project.interface';

export const ADDRESS_INHERITED_FIELDS: readonly TInheritedProjectField[] = [
  'address',
  'addressCity',
  'addressPlaceId',
];

export const BUILDING_INHERITANCE_ATTRIBUTES = [
  'id',
  'code',
  'name',
  'notes',
  'customerId',
  'hasGeneralLightingCeilingLowering',
  'generalLightingCeilingLoweringHeight',
  ...ADDRESS_INHERITED_FIELDS,
];
