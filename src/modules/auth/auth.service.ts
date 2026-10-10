import { JwtService } from '@nestjs/jwt';
import { LoginDto } from './dto/login.dto';
import { UserService } from '@Modules/user/user.service';
import { IUser } from '@Modules/user/interfaces/user.interface';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { SESSION_DURATION_SECONDS } from './constants/auth.constant';
import { ITokenPayload, ILoginResponse } from './interfaces/auth.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
  ) {}

  async login(credentials: LoginDto): Promise<ILoginResponse> {
    const user = await this.userService.findByCredentials(
      credentials.email,
      credentials.password,
    );

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const expiresIn = credentials.rememberMe
      ? SESSION_DURATION_SECONDS.REMEMBERED
      : SESSION_DURATION_SECONDS.STANDARD;
    const payload: ITokenPayload = { sub: user.id };
    const accessToken = await this.jwtService.signAsync(payload, { expiresIn });

    return { user, accessToken };
  }

  async authenticate(token: string): Promise<IUser> {
    const payload = await this.verifyToken(token);
    const user = await this.userService.findById(payload.sub);

    if (!user) {
      throw new UnauthorizedException('The session user no longer exists');
    }

    return user;
  }

  private async verifyToken(token: string): Promise<ITokenPayload> {
    try {
      return await this.jwtService.verifyAsync<ITokenPayload>(token);
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired session', {
        cause: error,
      });
    }
  }
}
