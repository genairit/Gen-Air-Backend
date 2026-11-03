import { UserRoleType } from '@Constants/user-role.constant';

export interface IUser {
  id: string;
  email: string;
  phone: string;
  createdAt: Date;
  updatedAt: Date;
  lastName: string;
  firstName: string;
  role: UserRoleType;
  passwordHash?: string;
  employeeNumber: string;
  deletedAt: Date | null;
  assignedRoles?: UserRoleType[];
}

export interface IUserFilter {
  search: string | null;
}

export interface IUserCredentials {
  id: string;
  passwordHash: string;
}

export type TUserRoleCounts = Record<UserRoleType, number> & {
  total: number;
};

export type TUserCreationAttributes = Pick<
  IUser,
  'firstName' | 'lastName' | 'email' | 'phone' | 'role'
> & { passwordHash: string };

export type TUserUpdateAttributes = Partial<
  Pick<IUser, 'firstName' | 'lastName' | 'email' | 'phone' | 'role'>
>;
