import { UserRoleType, USER_ROLES } from '@Constants/user-role.constant';

type TAssigneeScope = (
  userId: string,
  requestedAssigneeId: string | null,
) => string | null;
const managerScope: TAssigneeScope = (_userId, requestedAssigneeId) =>
  requestedAssigneeId;
const employeeScope: TAssigneeScope = (userId) => userId;

export const TASK_ASSIGNEE_SCOPE: Record<UserRoleType, TAssigneeScope> = {
  [USER_ROLES.SYSTEM_ADMIN]: managerScope,
  [USER_ROLES.PROJECT_MANAGER]: managerScope,
  [USER_ROLES.SECRETARY]: employeeScope,
  [USER_ROLES.LEAD_INSTALLER]: employeeScope,
};
