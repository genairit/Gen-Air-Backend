import { Request } from 'express';
import { IAuthorizedUser } from './authorized-user.interface';

export interface IAuthenticatedRequest<
  T extends object = object,
> extends Request {
  body: T;
  token?: string;
  aadRoles?: string[];
  user: IAuthorizedUser;
}
