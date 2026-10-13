import { UpdateProjectDto } from '../dto/update-project.dto';
import { IProjectContact } from '../interfaces/project.interface';

export const APARTMENT = {
  PAGE_SIZE: 25,
  NAME_PREFIX: 'דירה',
  CODE_SEQUENCE_DIGITS: 2,
} as const;

export const APARTMENT_EDITABLE_FIELDS: readonly (keyof UpdateProjectDto)[] = [
  'name',
  'notes',
  'stageId',
  'members',
  'paymentTerms',
  'paymentTermsNote',
  'contactName',
  'contactRole',
  'contactPhone',
  'customerName',
  'customerPhone',
  'customerFloor',
  'customerApartment',
];

export const APARTMENT_REQUIRED_FIELDS: readonly (keyof UpdateProjectDto)[] = [
  'customerFloor',
  'customerApartment',
];

export const APARTMENT_REQUIRED_CONTACT_FIELDS: readonly (keyof IProjectContact)[] =
  ['contactName', 'contactPhone'];
