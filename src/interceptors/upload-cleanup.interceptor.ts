import {
  Injectable,
  CallHandler,
  NestInterceptor,
  ExecutionContext,
} from '@nestjs/common';

import { rm } from 'node:fs/promises';
import { from, lastValueFrom, Observable } from 'rxjs';

interface IUploadRequest {
  files?: Express.Multer.File[];
}
@Injectable()
export class UploadCleanupInterceptor implements NestInterceptor {
  intercept(
    context: ExecutionContext,
    next: CallHandler<unknown>,
  ): Observable<unknown> {
    return from(
      this.handle(context.switchToHttp().getRequest<IUploadRequest>(), next),
    );
  }

  private async handle(
    request: IUploadRequest,
    next: CallHandler<unknown>,
  ): Promise<unknown> {
    try {
      return await lastValueFrom(next.handle());
    } finally {
      await Promise.all(
        (request.files ?? []).map((file) => rm(file.path, { force: true })),
      );
    }
  }
}
