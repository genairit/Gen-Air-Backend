export const PROJECT_DETAIL_FIELD_SETS = {
  COMPANY: 'company',
  INSTITUTION: 'institution',
  PRIVATE_CLIENT: 'private_client',
} as const;

export type ProjectDetailFieldSetType =
  (typeof PROJECT_DETAIL_FIELD_SETS)[keyof typeof PROJECT_DETAIL_FIELD_SETS];

export const PROJECT_DETAIL_FIELD_SET_VALUES: ProjectDetailFieldSetType[] =
  Object.values(PROJECT_DETAIL_FIELD_SETS);
