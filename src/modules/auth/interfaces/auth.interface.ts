import { IUser } from '@Modules/user/interfaces/user.interface';

export interface ITokenPayload {
  sub: string;
}

export interface ILoginResponse {
  user: IUser;
  accessToken: string;
}
