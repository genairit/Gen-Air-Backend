import {
  HttpException,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { getHttpErrorResponse } from './http-error.utility';
import { HTTP_ERROR_CODES } from '@Constants/http-error-code.constant';

describe('public HTTP error code boundary', () => {
  it('preserves the explicit import contract without copying arbitrary fields', () => {
    expect(
      getHttpErrorResponse(
        new UnprocessableEntityException({
          message: 'invalid template',
          code: HTTP_ERROR_CODES.INVALID_TEMPLATE,
          secret: 'private',
        }),
      ),
    ).toEqual({
      statusCode: 422,
      message: 'invalid template',
      code: HTTP_ERROR_CODES.INVALID_TEMPLATE,
    });
  });
  it('does not expose unapproved or database error codes', () => {
    expect(
      getHttpErrorResponse(
        new BadRequestException({ message: 'bad', code: '23505' }),
      ),
    ).toEqual({ statusCode: 400, message: 'bad' });
    expect(getHttpErrorResponse(new Error('private database details'))).toEqual(
      { statusCode: 500, message: 'Internal Server Error' },
    );
  });
  it('preserves raw HTTP messages and Nest validation message arrays', () => {
    expect(getHttpErrorResponse(new HttpException('raw', 400))).toEqual({
      statusCode: 400,
      message: 'raw',
    });
    expect(
      getHttpErrorResponse(
        new BadRequestException({
          message: ['name is required', 'email is invalid'],
        }),
      ),
    ).toEqual({
      statusCode: 400,
      message: ['name is required', 'email is invalid'],
    });
  });

  it.each([
    { message: { private: 'hidden' } },
    { message: 42 },
    { message: ['valid', 42] },
  ])('falls back for malformed public message %p', ({ message }) => {
    const error = new BadRequestException({ message });
    expect(getHttpErrorResponse(error)).toEqual({
      statusCode: 400,
      message: error.message,
    });
  });

  it('keeps ordinary errors and explicitly safe response data compatible', () => {
    expect(getHttpErrorResponse(new BadRequestException('bad'))).toEqual({
      statusCode: 400,
      message: 'bad',
    });
    expect(
      getHttpErrorResponse(
        new BadRequestException({
          message: 'bad',
          safeResponse: { remaining: 0 },
        }),
      ),
    ).toEqual({
      statusCode: 400,
      message: 'bad',
      safeResponse: { remaining: 0 },
    });
  });
});
