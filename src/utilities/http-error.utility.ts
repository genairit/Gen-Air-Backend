import {
  HttpErrorCodeType,
  HTTP_ERROR_CODE_VALUES,
} from '@Constants/http-error-code.constant';

import { isObject } from './object.utility';
import { HttpException } from '@nestjs/common';

type TSafeResponse = Record<string, unknown>;
type TPublicErrorMessage = string | string[];

interface IHttpErrorResponse {
  statusCode: number;
  code?: HttpErrorCodeType;
  message: TPublicErrorMessage;
  safeResponse?: TSafeResponse;
}

const isMessageArray = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.every((item: unknown) => typeof item === 'string');

const extractErrorMessage = (error: HttpException): TPublicErrorMessage => {
  const response = error.getResponse();

  if (!response) {
    return error.message;
  }

  if (typeof response === 'string') {
    return response;
  }

  const message: unknown = Reflect.get(response, 'message');
  if (typeof message === 'string' || isMessageArray(message)) {
    return message;
  }

  return error.message;
};

const extractSafeResponse = (error: HttpException): TSafeResponse | null => {
  const response = error.getResponse();

  if (!isObject(response)) {
    return null;
  }

  const safeResponse: unknown = Reflect.get(response, 'safeResponse');

  if (isObject(safeResponse)) {
    return safeResponse;
  }

  return null;
};

const extractErrorCode = (error: HttpException): HttpErrorCodeType | null => {
  const response = error.getResponse();
  if (!isObject(response)) {
    return null;
  }

  const code: unknown = Reflect.get(response, 'code');
  return HTTP_ERROR_CODE_VALUES.find((allowed) => allowed === code) ?? null;
};

export const getHttpErrorResponse = (error: unknown): IHttpErrorResponse => {
  if (!(error instanceof HttpException)) {
    return { statusCode: 500, message: 'Internal Server Error' };
  }

  const safeResponse = extractSafeResponse(error);
  const code = extractErrorCode(error);
  const result: IHttpErrorResponse = {
    statusCode: error.getStatus(),
    message: extractErrorMessage(error),
  };

  if (code) {
    result.code = code;
  }

  if (safeResponse) {
    result.safeResponse = safeResponse;
  }

  return result;
};
