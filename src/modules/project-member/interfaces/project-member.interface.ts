import { UserRoleType } from '@Constants/user-role.constant';
import { IUser } from '@Modules/user/interfaces/user.interface';

export interface IProjectMember {
  id: string;
  user?: IUser;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  projectId: string;
  role: UserRoleType;
}

export interface IProjectMemberAssignment {
  userId: string;
  role: UserRoleType;
}

export type TProjectMemberCreationAttributes = Pick<
  IProjectMember,
  'projectId' | 'userId' | 'role'
>;
