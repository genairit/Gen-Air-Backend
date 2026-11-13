import {
  Req,
  Res,
  Body,
  Post,
  Patch,
  HttpCode,
  HttpStatus,
  Controller,
} from '@nestjs/common';

import {
  createAnonymousClient,
  verifyAnonymousClient,
  anonymousClientSetCookie,
  readAnonymousClientCookie,
} from '@Utilities/anonymous-client.utility';

import { ApiTags } from '@nestjs/swagger';
import { LoginDto } from './dto/login.dto';
import { AuthService } from './auth.service';
import type { Request, Response } from 'express';
import { Public } from '@Decorators/public.decorator';
import type { ILoginResponse } from './interfaces/auth.interface';
import { Authenticated } from '@Decorators/authenticated.decorator';
import { SwitchUserRoleDto } from '@Modules/user/dto/switch-user-role.dto';
import { EnvironmentManager } from '@Utilities/environment-manager.utility';
import { AuthenticatedUser } from '@Decorators/authenticated-user.decorator';
import type { IAuthorizedUser } from '@Interfaces/authorized-user.interface';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(
    @Body() credentials: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ILoginResponse> {
    const secret = EnvironmentManager.get('AUTH_CLIENT_SECRET', {
      errorOnMissing: true,
    });
    const supplied = readAnonymousClientCookie(request.headers.cookie ?? null);
    const clientId = verifyAnonymousClient(supplied, secret);
    if (clientId) {
      return this.authService.login(credentials, clientId);
    }

    const created = createAnonymousClient(secret);
    response.setHeader('Set-Cookie', anonymousClientSetCookie(created.token));
    return this.authService.login(credentials, created.clientId);
  }

  @Patch('role')
  @Authenticated()
  switchActiveRole(
    @AuthenticatedUser() user: IAuthorizedUser,
    @Body() changes: SwitchUserRoleDto,
  ): Promise<IAuthorizedUser> {
    return this.authService.switchActiveRole(user, changes.role);
  }
}
