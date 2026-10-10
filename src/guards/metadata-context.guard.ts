import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

export const HANDLER_KEY = Symbol('handler');

@Injectable()
export class MetadataContextGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    request[HANDLER_KEY] = context.getHandler();

    return true;
  }
}