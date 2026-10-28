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
import { hasPermission } from '@Utilities/permission.utility';
import { PermissionType } from '@Constants/authorization.constant';
import { BEARER_PREFIX } from '@Modules/auth/constants/auth.constant';
import { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
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

    if (!this.isPermissionAllowed(context, request.user)) {
      throw new ForbiddenException(
        'You do not have permission to perform this action',
      );
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

  private isPermissionAllowed(
    context: ExecutionContext,
    user: IAuthorizedUser,
  ): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const permissions = this.reflector.getAllAndOverride<
      readonly PermissionType[] | null
    >(METADATA_KEYS.PERMISSIONS, targets);

    if (permissions) {
      return (
        permissions.length > 0 &&
        permissions.every((permission) => hasPermission(user, permission))
      );
    }

    return (
      this.reflector.getAllAndOverride<boolean | null>(
        METADATA_KEYS.AUTHENTICATED_ONLY,
        targets,
      ) ?? false
    );
  }
}
