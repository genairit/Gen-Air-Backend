import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { IAuthenticatedRequest } from '@Interfaces/authenticated-request.interface';

export const AuthenticatedUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<IAuthenticatedRequest>().user,
);
