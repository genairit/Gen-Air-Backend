import { IAuthorizedUser } from '@Interfaces/authorized-user.interface';

export interface ITokenPayload {
  sub: string;
}

export interface ILoginResponse {
  accessToken: string;
  user: IAuthorizedUser;
}
