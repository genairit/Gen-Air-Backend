import {
  PROJECT_DETAIL_FIELD_SETS,
  ProjectDetailFieldSetType,
} from '@Constants/project-detail-field-set.constant';

import { IProjectContact } from '../interfaces/project.interface';

export const EMPTY_CONTACT: IProjectContact = {
  contactName: null,
  contactRole: null,
  contactPhone: null,
};

export const CONTACT_FIELDS = Object.keys(EMPTY_CONTACT).filter(
  (key): key is keyof IProjectContact => key in EMPTY_CONTACT,
);

export const ADDRESS_CITY_REQUIRED_BY_FIELD_SET: Record<
  ProjectDetailFieldSetType,
  boolean
> = {
  [PROJECT_DETAIL_FIELD_SETS.COMPANY]: false,
  [PROJECT_DETAIL_FIELD_SETS.INSTITUTION]: false,
  [PROJECT_DETAIL_FIELD_SETS.PRIVATE_CLIENT]: true,
};
