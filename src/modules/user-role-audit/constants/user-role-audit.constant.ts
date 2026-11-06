export const USER_ROLE_AUDIT_ACTIONS = {
  ASSIGNMENT: 'assignment',
  SWITCH: 'switch',
} as const;

export type UserRoleAuditActionType =
  (typeof USER_ROLE_AUDIT_ACTIONS)[keyof typeof USER_ROLE_AUDIT_ACTIONS];
