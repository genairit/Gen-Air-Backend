export const PROJECT_CONTACT_ROLES = {
  ARCHITECT: 'architect',
  CONSULTANT: 'consultant',
  PROJECT_MANAGER: 'project_manager',
} as const;

export type ProjectContactRoleType =
  (typeof PROJECT_CONTACT_ROLES)[keyof typeof PROJECT_CONTACT_ROLES];

export const PROJECT_CONTACT_ROLE_VALUES = Object.values(PROJECT_CONTACT_ROLES);
