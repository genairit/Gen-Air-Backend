import { UserRoleType } from '@Constants/user-role.constant';
import { UserRoleAuditActionType } from '../constants/user-role-audit.constant';

export interface IUserRoleAudit {
  id: string;
  actorId: string;
  createdAt: Date;
  subjectUserId: string;
  actorRole: UserRoleType;
  nextRole: UserRoleType | null;
  action: UserRoleAuditActionType;
  previousRole: UserRoleType | null;
  nextAssignedRoles: UserRoleType[];
  previousAssignedRoles: UserRoleType[];
}

export type TUserRoleAuditCreationAttributes = Omit<
  IUserRoleAudit,
  'id' | 'createdAt'
>;
