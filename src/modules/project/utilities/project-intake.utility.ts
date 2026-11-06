import {
  IProjectContact,
  TProjectIntakeInput,
} from '../interfaces/project.interface';

import {
  EMPTY_CONTACT,
  CONTACT_FIELDS,
} from '../constants/project-intake.constant';

const mergeFields = <T extends object>(
  fields: readonly (keyof T)[],
  current: T,
  changes: Partial<T>,
): T =>
  fields.reduce<T>(
    (merged, field) => ({
      ...merged,
      [field]: field in changes ? (changes[field] ?? null) : current[field],
    }),
    current,
  );

export const hasContactChanges = (changes: TProjectIntakeInput): boolean =>
  CONTACT_FIELDS.some((field) => field in changes);

export const hasAddressChanges = (changes: TProjectIntakeInput): boolean =>
  'addressPlaceId' in changes;

export const mergeContact = (
  current: Partial<IProjectContact>,
  changes: Partial<IProjectContact>,
): IProjectContact =>
  mergeFields(
    CONTACT_FIELDS,
    mergeFields(CONTACT_FIELDS, EMPTY_CONTACT, current),
    changes,
  );

export const findMissingContactFields = (
  contact: IProjectContact,
  requiredFields: readonly (keyof IProjectContact)[] = CONTACT_FIELDS,
): (keyof IProjectContact)[] =>
  requiredFields.filter((field) => contact[field] == null);
