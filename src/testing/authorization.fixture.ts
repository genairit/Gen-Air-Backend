import { USER_ROLES } from '@Constants/user-role.constant';
import { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import { PERMISSIONS, PermissionType } from '@Constants/authorization.constant';

const READ_PERMISSIONS = [
  PERMISSIONS.PROJECTS_READ,
  PERMISSIONS.CUSTOMERS_READ,
  PERMISSIONS.TASKS_READ,
  PERMISSIONS.EMPLOYEES_READ,
  PERMISSIONS.DRIVE_READ,
  PERMISSIONS.DRIVE_UPLOAD,
  PERMISSIONS.DRIVE_TEMPLATES_READ,
];

const EDIT_PERMISSIONS = [
  PERMISSIONS.PROJECTS_UPDATE,
  PERMISSIONS.PROJECTS_STATUS_CHANGE,
  PERMISSIONS.APARTMENTS_CREATE,
  PERMISSIONS.DRIVE_MOVE,
  PERMISSIONS.DRIVE_DELETE,
  PERMISSIONS.DRIVE_PROVISION,
  PERMISSIONS.ADDRESSES_LOOKUP,
];

const BASELINE_GRANTS: Record<string, readonly PermissionType[]> = {
  [USER_ROLES.FINANCE]: READ_PERMISSIONS,
  [USER_ROLES.INSTALLER]: READ_PERMISSIONS,
  [USER_ROLES.SECRETARY]: [...READ_PERMISSIONS, ...EDIT_PERMISSIONS],
  [USER_ROLES.PROJECT_MANAGER]: [...READ_PERMISSIONS, ...EDIT_PERMISSIONS],
  [USER_ROLES.ENGINEER]: [
    ...READ_PERMISSIONS,
    PERMISSIONS.TASKS_CLAIM,
    PERMISSIONS.TASKS_STATUS_UPDATE,
  ],
  [USER_ROLES.SYSTEM_ADMIN]: Object.values(PERMISSIONS).filter(
    (permission) => permission !== PERMISSIONS.TASKS_CLAIM,
  ),
};

export const baselinePermissions = (role: string): PermissionType[] => [
  ...(BASELINE_GRANTS[role] ?? []),
];

export const authorizedUser = (
  permissions: PermissionType[] = [],
): IAuthorizedUser => ({
  permissions,
  id: 'permission-test-user',
  role: USER_ROLES.SYSTEM_ADMIN,
  email: 'permission@test.invalid',
  phone: '0500000000',
  firstName: 'Test',
  lastName: 'User',
  employeeNumber: 'TEST-47',
  deletedAt: null,
  createdAt: new Date('2026-10-25T00:00:00Z'),
  updatedAt: new Date('2026-10-25T00:00:00Z'),
});
