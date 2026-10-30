export const CUSTOMER_PROJECT_KINDS = {
  BUILDING: 'building',
  PROJECT: 'project',
  APARTMENT: 'apartment',
} as const;

export type CustomerProjectKindType =
  (typeof CUSTOMER_PROJECT_KINDS)[keyof typeof CUSTOMER_PROJECT_KINDS];

export const CUSTOMER_PROJECT_PAGINATION = {
  INITIAL_SIZE: 8,
  NEXT_SIZE: 10,
  MAX_SIZE: 100,
  MAX_CURSOR_LENGTH: 4096,
  ENCODING: 'base64url',
} as const;

export const CUSTOMER_PROJECT_ATTRIBUTES = [
  'id',
  'name',
  'code',
  'stageId',
  'updatedAt',
  'parentProjectId',
  'customerFloor',
  'hasOwnTeam',
];

export const CUSTOMER_PROJECT_USER_ATTRIBUTES = ['id', 'firstName', 'lastName'];
