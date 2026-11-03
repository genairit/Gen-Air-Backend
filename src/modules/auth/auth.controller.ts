import {
  Body,
  Post,
  Patch,
  HttpCode,
  HttpStatus,
  Controller,
} from '@nestjs/common';

import { ApiTags } from '@nestjs/swagger';
import { LoginDto } from './dto/login.dto';
import { AuthService } from './auth.service';
import { Public } from '@Decorators/public.decorator';
import type { ILoginResponse } from './interfaces/auth.interface';
import { Authenticated } from '@Decorators/authenticated.decorator';
import { SwitchUserRoleDto } from '@Modules/user/dto/switch-user-role.dto';
import { AuthenticatedUser } from '@Decorators/authenticated-user.decorator';
import type { IAuthorizedUser } from '@Interfaces/authorized-user.interface';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() credentials: LoginDto): Promise<ILoginResponse> {
    return this.authService.login(credentials);
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
