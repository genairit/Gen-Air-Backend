import { Request } from 'express';
import { IUser } from '@Modules/user/interfaces/user.interface';

export interface IAuthenticatedRequest<
  T extends object = object,
> extends Request {
  body: T;
  user: IUser;
  token?: string;
  aadRoles?: string[];
}
