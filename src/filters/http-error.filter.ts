import { HEADERS } from '../constants/headers';
import { TypedLogger } from '../logger/logger.service';
import { Reflector, HttpAdapterHost } from '@nestjs/core';
import { METADATA_KEYS } from '../constants/metadata-keys';
import { HANDLER_KEY } from '../guards/metadata-context.guard';
import { Catch, ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Request, Response } from 'express';
import { getHttpErrorResponse } from '../utilities/http-error.utility';
import { AlwaysSucceedOptions } from '../decorators/always-success.decorator';

interface FilterRequest extends Request {
  [HANDLER_KEY]?: (...args: never[]) => unknown;
}

@Catch()
export class GeneralFilter implements ExceptionFilter {
  private readonly reflector = new Reflector();

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(error: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const httpConnection = host.switchToHttp();

    const request = httpConnection.getRequest<FilterRequest>();
    const response = httpConnection.getResponse<Response>();

    const result = getHttpErrorResponse(error);

    const handler = request[HANDLER_KEY];

    const alwaysSucceed = handler
      ? this.reflector.get<AlwaysSucceedOptions>(
          METADATA_KEYS.ALWAYS_SUCCEED,
          handler,
        )
      : null;

    TypedLogger.global.error({
      error,
      status: result.statusCode,
      message: 'Exception caught',
    });

    if (alwaysSucceed) {
      httpAdapter.setHeader(
        response,
        HEADERS.X_HTTP_STATUS,
        String(result.statusCode),
      );

      httpAdapter.reply(response, result, alwaysSucceed.status);
    }

    httpAdapter.reply(response, result, result.statusCode);
  }
}
