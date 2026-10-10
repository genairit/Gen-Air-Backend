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
}

export interface IUserFilter {
  search: string | null;
  role: UserRoleType | null;
}

export interface IUserCredentials {
  id: string;
  passwordHash: string;
}

export interface IUserRoleCount {
  count: number;
  role: UserRoleType;
}

export type TUserRoleCounts = Record<UserRoleType, number>;

export type TUserCreationAttributes = Pick<
  IUser,
  'firstName' | 'lastName' | 'email' | 'phone' | 'role'
> & { passwordHash: string };

export type TUserUpdateAttributes = Partial<
  Pick<IUser, 'firstName' | 'lastName' | 'email' | 'phone' | 'role'>
>;
