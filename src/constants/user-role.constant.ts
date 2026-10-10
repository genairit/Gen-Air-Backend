export const USER_ROLES = {
  SECRETARY: 'secretary',
  SYSTEM_ADMIN: 'system_admin',
  LEAD_INSTALLER: 'lead_installer',
  PROJECT_MANAGER: 'project_manager',
} as const;

export type UserRoleType = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export const USER_ROLE_VALUES: UserRoleType[] = Object.values(USER_ROLES);
