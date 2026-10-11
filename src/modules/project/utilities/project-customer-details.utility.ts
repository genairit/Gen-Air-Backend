import {
  IProject,
  IProjectCustomerDetails,
  ProjectCustomerDetailFieldType,
} from '../interfaces/project.interface';

import {
  EMPTY_CUSTOMER_DETAILS,
  CUSTOMER_DETAIL_FIELDS_BY_SET,
  PROJECT_CUSTOMER_DETAIL_FIELDS,
} from '../constants/project-customer-details.constant';

import { ProjectDetailFieldSetType } from '@Constants/project-detail-field-set.constant';

export const hasCustomerDetailChanges = (
  changes: Partial<IProjectCustomerDetails>,
): boolean => PROJECT_CUSTOMER_DETAIL_FIELDS.some((field) => field in changes);

export const mergeCustomerDetails = (
  current: IProjectCustomerDetails,
  changes: Partial<IProjectCustomerDetails>,
): IProjectCustomerDetails =>
  PROJECT_CUSTOMER_DETAIL_FIELDS.reduce<IProjectCustomerDetails>(
    (details, field) => ({
      ...details,
      [field]: field in changes ? (changes[field] ?? null) : current[field],
    }),
    current,
  );

export const pickCustomerDetails = (
  source: Partial<IProjectCustomerDetails>,
): IProjectCustomerDetails =>
  mergeCustomerDetails(EMPTY_CUSTOMER_DETAILS, source);

export const scopeCustomerDetailsToFieldSet = (
  details: IProjectCustomerDetails,
  fieldSet: ProjectDetailFieldSetType,
): IProjectCustomerDetails =>
  CUSTOMER_DETAIL_FIELDS_BY_SET[fieldSet].reduce<IProjectCustomerDetails>(
    (scoped, field) => ({ ...scoped, [field]: details[field] }),
    EMPTY_CUSTOMER_DETAILS,
  );

export const findMissingCustomerDetails = (
  details: IProjectCustomerDetails,
  fieldSet: ProjectDetailFieldSetType,
): ProjectCustomerDetailFieldType[] =>
  CUSTOMER_DETAIL_FIELDS_BY_SET[fieldSet].filter(
    (field) => details[field] == null,
  );

export const isProjectTypeChanging = (
  project: IProject,
  changes: Partial<Pick<IProject, 'projectTypeId'>>,
): boolean =>
  changes.projectTypeId != null &&
  changes.projectTypeId !== project.projectTypeId;
