import { IAuthorizedUser } from '@Interfaces/authorized-user.interface';

export interface ITokenPayload {
  sub: string;
  sessionVersion: number;
}

export interface ILoginResponse {
  accessToken: string;
  user: IAuthorizedUser;
}
