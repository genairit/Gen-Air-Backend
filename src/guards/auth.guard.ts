import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';

import { Reflector } from '@nestjs/core';
import { METADATA_KEYS } from '@Constants/metadata-keys';
import { AuthService } from '@Modules/auth/auth.service';
import { UserRoleType } from '@Constants/user-role.constant';
import { BEARER_PREFIX } from '@Modules/auth/constants/auth.constant';
import { IAuthenticatedRequest } from '@Interfaces/authenticated-request.interface';

const extractBearerToken = (authorization?: string): string | null => {
  if (!authorization?.startsWith(BEARER_PREFIX)) {
    return null;
  }

  return authorization.slice(BEARER_PREFIX.length);
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.isPublic(context)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<IAuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException('A bearer token is required');
    }

    request.user = await this.authService.authenticate(token);

    if (!this.isRoleAllowed(context, request.user.role)) {
      throw new ForbiddenException('Your role cannot perform this action');
    }

    return true;
  }

  private isPublic(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean | null>(
      METADATA_KEYS.IS_PUBLIC,
      [context.getHandler(), context.getClass()],
    );

    return isPublic ?? false;
  }

  private isRoleAllowed(
    context: ExecutionContext,
    role: UserRoleType,
  ): boolean {
    const allowedRoles = this.reflector.getAllAndOverride<
      readonly UserRoleType[] | null
    >(METADATA_KEYS.USER_ROLES, [context.getHandler(), context.getClass()]);

    if (!allowedRoles) {
      return true;
    }

    return allowedRoles.includes(role);
  }
}
