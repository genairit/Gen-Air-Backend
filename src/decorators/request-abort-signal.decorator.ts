import type { Response } from 'express';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export class ClientDisconnectedError extends Error {
  constructor() {
    super('The client disconnected before the response was sent');
    this.name = ClientDisconnectedError.name;
  }
}

interface IClosableResponse {
  writableFinished: boolean;
  once: (event: 'close', listener: () => void) => unknown;
}

export const toRequestAbortSignal = (
  response: IClosableResponse,
): AbortSignal => {
  const controller = new AbortController();

  response.once('close', () => {
    if (response.writableFinished) {
      return;
    }

    controller.abort(new ClientDisconnectedError());
  });

  return controller.signal;
};

export const RequestAbortSignal = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    toRequestAbortSignal(context.switchToHttp().getResponse<Response>()),
);
