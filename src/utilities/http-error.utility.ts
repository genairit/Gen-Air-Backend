import { isString } from 'class-validator';
import { HttpException } from '@nestjs/common';
import { isObject } from './object.utility';

type TSafeResponse = Record<string, unknown>;

interface IHttpErrorResponse {
  message: string;
  statusCode: number;
  safeResponse?: TSafeResponse;
}

const extractErrorMessage = (error: HttpException): string => {
  const response = error.getResponse();

  if (!response) {
    return error.message;
  }

  if (isString(response)) {
    return response;
  }

  if (Reflect.has(response, 'message')) {
    return Reflect.get(response, 'message');
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

export const getHttpErrorResponse = (error: unknown): IHttpErrorResponse => {
  if (error && error instanceof HttpException) {
    const safeResponse = extractSafeResponse(error);

    const result: IHttpErrorResponse = {
      statusCode: error.getStatus(),
      message: extractErrorMessage(error),
    };

    if (safeResponse) {
      result.safeResponse = safeResponse;
    }

    return result;
  }

  return {
    statusCode: 500,
    message: 'Internal Server Error',
  };
};