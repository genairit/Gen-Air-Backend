import { UserRoleType } from '@Constants/user-role.constant';

export interface IUserRole {
  id: string;
  userId: string;
  createdAt: Date;
  role: UserRoleType;
}

export type TUserRoleCreationAttributes = Pick<IUserRole, 'userId' | 'role'>;
