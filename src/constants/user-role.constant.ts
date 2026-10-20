export const USER_ROLES = {
  FINANCE: 'finance',
  ENGINEER: 'engineer',
  INSTALLER: 'installer',
  SECRETARY: 'secretary',
  SYSTEM_ADMIN: 'system_admin',
  PROJECT_MANAGER: 'project_manager',
} as const;

export type UserRoleType = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export const USER_ROLE_VALUES: UserRoleType[] = Object.values(USER_ROLES);

export const PROJECT_MEMBER_ROLES = [
  USER_ROLES.ENGINEER,
  USER_ROLES.SECRETARY,
  USER_ROLES.INSTALLER,
  USER_ROLES.PROJECT_MANAGER,
] as const satisfies readonly UserRoleType[];

export type ProjectMemberRoleType = (typeof PROJECT_MEMBER_ROLES)[number];
